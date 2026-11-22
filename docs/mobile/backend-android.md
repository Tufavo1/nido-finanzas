<!-- Copyright (c) 2026 Dinovance -->
# Backend y Android nativo (fase VERDE) · 2026-11-21

Todo se hizo en local. Nada contactó producción ni la nube. Las migraciones solo se aplicaron en la base de staging local (`nido-selfhost-db-1`).

## Arquitectura

```
Notificación de otra app ──► NotificationCaptureService (solo paquetes de la lista blanca)
                                   │  título + texto (máx. 2.000 caracteres)
                                   ▼
                          CaptureProcessor (Kotlin puro, nunca lanza)
                           ├─ NotificationParser (native/core, cl.nido.parser)
                           ├─ deduplicación 2 min (huella, o monto + comercio)
                           ├─ EncryptedDraftRepository  ← AES-256-GCM, clave en Android Keystore
                           └─ CaptureNotifier  → «Gasto detectado» [Guardar] [Cambiar categoría] [Ignorar]
                                   │
WebView (React) ◄── ContigoNativePlugin (Capacitor, "ContigoNative") ──► web/src/lib/nativeBridge.ts
   candidates.ts  → borrador de gasto, decideCapture (modo CONFIRM por defecto)
   offlineQueue.ts → envío con id idempotente (newId + 23505) y retroceso exponencial con tope
   nativeApi.ts   → HTTP nativo sin cabecera Origin, VITE_API_BASE, x-request-id, tiempos de espera
   secureSession.ts → sesión de supabase-js en Keystore (sin localStorage)
```

El texto bruto del aviso vive solo dentro de `CaptureProcessor.process` y del parser: no se guarda, no se registra, no está en `ParsedCandidate` ni en el borrador (hay pruebas: el archivo cifrado no contiene monto ni texto, y `ParsedCandidate` solo expone 6 campos).

### Parser (`native/core`)
Módulo JVM puro. Orden: lista blanca exacta por paquete → descarte (clave, código, contraseña, oferta, descuento, cupón, saldo, rechazada, pago de cuota, moneda extranjera) → montos (`$`, `CLP`, `pesos`; centavos ignorados; 0 y ≥ 10.000.000.000 descartados) → tipo (abono/devolución = INCOME, retiro = EXPENSE con confianza LOW) → comercio (`en X`, `a X`, o `a X por` en transferencias; MAYÚSCULAS pasan a Título; sin comercio = MEDIUM) → cuota (`Cuota N de M`, `Primera cuota` + `M cuotas`; se registra el valor de la cuota) → huella SHA-256 (paquete + texto normalizado + monto + minuto). Una clase por regla: `DiscardRules`, `MoneyExtractor`, `InstallmentExtractor`, `MovementClassifier`, `MerchantExtractor`, `Fingerprint`. El módulo se incluye en la app Android como build incluido (`includeBuild('../../native/core')`, coordenadas `cl.nido:parser`).

### App Android (`web/android`)
- `capture/NotificationCaptureService`: lista blanca decidida por paquete ANTES de leer los extras; cualquier excepción al leer extras se cuenta (nombre de clase) y el servicio sigue; `onListenerDisconnected` pide reconectar.
- `capture/CaptureProcessor`: el núcleo, sin Android, probado en JVM. Los abonos no generan borrador (no se propone gasto, CA-02-5).
- Cola cifrada: `security/KeystoreAesGcm` (clave no exportable en Keystore, IV aleatorio, formato versionado) + `AtomicFileStorage` en `noBackupFilesDir`. Máx. 50 borradores, vencen a los 7 días. Archivo dañado o clave perdida: se vacía y se sigue.
- Notificación propia: canal `contigo_capture`; con «ocultar en bloqueo» (activado por defecto) la versión pública no trae monto ni comercio. «Guardar» e «Ignorar» son un `BroadcastReceiver` interno; «Cambiar categoría» y el toque abren la app con el borrador (`consumePendingOpen` / evento `draftOpen`).
- Pantalla guiada `ui/PermissionGuideActivity`: paso 1 «Permitir ajustes restringidos» (solo Android 13+), paso 2 Acceso a notificaciones, paso 3 batería.
- Enlace profundo `nido://gasto` (intent-filter con esquema y host fijos); el contenido lo valida `deepLink.ts` con reglas estrictas.
- Manifiesto: `allowBackup=false`, `usesCleartextTraffic=false`, `networkSecurityConfig` (solo HTTPS y solo certificados del sistema), servicio protegido con `BIND_NOTIFICATION_LISTENER_SERVICE`, receptor y pantalla guiada no exportados, `minSdk 26`.
- `capacitor.config.ts`: `loggingBehavior: none`, sin contenido mixto, sin depuración de WebView.
- Diagnóstico: `ContigoApplication` instala un `UncaughtExceptionHandler` que guarda en un registro circular (20 entradas) SOLO clase de la excepción y marcos de pila (nunca el mensaje). En el siguiente arranque `sendPendingCrashReports` los manda por la RPC `report_client_error` y borra el registro solo si todos se enviaron. Latido de salud: `getStatus()` entrega permiso, conexión, último aviso, fallos (por clase), `revokedSinceConnected` y `batteryOptimized`; `buildHealthReport` convierte «permiso revocado» en el código `LISTENER_REVOKED`.

### Capa TypeScript (`web/src/lib`)
`appError` (12 tipos, mensajes fijos en español, mapeo HTTP/Supabase/Postgres incl. 23505 → CONFLICT «Ese registro ya estaba guardado», nunca copia texto del servidor), `nativeApi` (+ `createTrackedFetch(base)`, que ahora vive en `trackedFetch.ts` y recibe el fetch que sale a la red; la web usa el global como antes), `secureSession`, `offlineQueue` (+ `retryDelayMs`, `drainWithBackoff`), `candidates`, `deepLink`, `securityEvents`, `bankNotice` (reglas RF-03, mismas palabras que Kotlin), `nativeBridge` (interfaz tipada + validación de lo que llega del plugin), `clientReport`. `supabase.ts` elige HTTP nativo + Keystore cuando corre dentro de la app (`isNativeApp()`); en la web no cambia nada. `categorize.ts` ganó `learnedCategory` (solo lo aprendido del historial) para que el modo automático no cuente la lista fija de comercios.

## Observabilidad (migraciones nuevas, aprobadas en staging)
| Archivo | Qué crea |
|---|---|
| `20261121120000_observabilidad_errores_cliente.sql` | `client_errors` (solo códigos, versión, pantalla, correlación, marcos de pila validados; `reporter_key` = resumen irreversible), RPC `report_client_error` con validación y límite de 30 reportes por 10 min, disparador de solo-agregar, `obs_can_read()` para las políticas, `purge_observability()` (no expuesta) |
| `20261121130000_observabilidad_eventos_seguridad.sql` | `security_events`, disparador de cambio de rol en `admins`, eventos desde `report_client_error` (`LISTENER_REVOKED`, `PUSH_QUEUE_STUCK`), `security_overview(p_hours)` |
| `20261121140000_push_tokens_nativos.sql` | `native_push_tokens` (FCM) con RLS por persona y tope de 10 dispositivos |

`security_overview` devuelve `{generated_at, window_hours, counters, alerts[], events[], health, limits}`. Alertas: fuerza bruta y fallos de MFA (solo si hay ingesta, ver abajo), sondeo de cuentas (≥ 10 `user_repeated_signup` en 10 min), ráfaga de recuperaciones, acceso desde ≥ 3 redes a la vez, inicio desde red nueva, cambio de administradores, permiso revocado, pico de errores de la app. IP enmascaradas (/24), cuentas como resumen `u_xxxxxxxx`.

### Lo que NO cubre (límite honesto)
- GoTrue no registra intentos de login fallidos; `login_failed_blocked` y `mfa_failed` solo cuentan lo que alguien inserte en `security_events` (hace falta la ingesta de Kong, fase siguiente). Mientras tanto la fuerza bruta no se detecta aquí.
- `health.gateway` es una inferencia a partir de errores que reporta la app, no una sonda real; `health.auth` solo mira si hay actividad reciente en el registro de GoTrue.
- Un atacante con acceso de superusuario a la base puede alterar el registro; el disparador de solo-agregar frena a las personas y a la API, no a quien administra Postgres.
- Muestra indicios y alertas; no garantiza detectar todo ataque.

## Push nativo (FCM)
`supabase/functions/notify/fcm.ts` + `sendNative` en `index.ts`. Desactivado si no existe el secreto `FCM_SERVICE_ACCOUNT_JSON` (y la app sin `google-services.json` no registra token). Solo habla con `oauth2.googleapis.com` y `fcm.googleapis.com`; prioridad alta; token no registrado (404) se borra; si falla, el gasto ya está guardado y solo se registra «fcm error» sin contenido. **NO VERIFICADO**: no hay Deno en este equipo, no se ejecutó ni se compiló esa función.

## Cómo probar
```bash
source ~/.config/mobile-env.sh
gradle -p native/core jvmTest                       # nucleo KMP (72 pruebas, ver kmp.md)
cd web/android && gradle :app:testDebugUnitTest       # núcleo de captura, cola cifrada, registro de cierres (17 pruebas)
npm --prefix web test                                 # todo vitest
npm --prefix web run lint && npm --prefix web exec -- tsc -b web
# Base (SOLO staging local):
docker exec -i nido-selfhost-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/observabilidad.sql
docker exec -i nido-selfhost-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/push_nativo.sql
# APK de depuración (Docker):
ALLOW_LOCAL_BUILD=1 bash scripts/docker-android-build.sh debug
$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging dist-apk/nido-debug.apk
```
Para que el APK hable con un Worker, compilar con `VITE_API_BASE=https://<worker>/supabase` (variable pública). Sin ella, dentro de la app las peticiones van a `https://localhost/supabase` y fallan como «sin conexión».

## Decisiones
- «Guardar» de la notificación confirma el borrador, pero el envío al servidor lo hace la app al abrirse (necesita la sesión y la cola idempotente); reimplementar la renovación de sesión en Kotlin se descartó. Consecuencia: guardar sin abrir la app no llega al servidor hasta el siguiente arranque.
- Los abonos se descartan en el servicio nativo; `candidates.ts` igualmente los trata como «pedir confirmación» si llegaran.
- Deduplicación por huella (incluye el minuto) y además por monto + comercio en 2 min, para cubrir el cambio de minuto. Dos compras reales iguales en 2 min se tratan como una (RIESGO-06).
- Permisos del APK además de los pedidos: `VIBRATE`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK` y `com.google.android.c2dm.permission.RECEIVE` los traen los plugins de Capacitor (haptics, network, push/FCM) al fusionar manifiestos. No se pidió acceso a la lista de apps instaladas ni excepción de batería.
- Dependencias de Capacitor fijadas a la versión exacta instalada; `package-lock.json` regenerado con `--package-lock-only`.

## NO VERIFICADO
- Todo lo que requiere un teléfono: que el servicio reciba avisos reales, el flujo «Permitir ajustes restringidos», que las acciones de la notificación funcionen, el comportamiento con Doze y fabricantes, el Keystore real (las pruebas JVM usan AES-GCM de la JVM, no Keystore), la pantalla guiada en pantalla.
- Que `CapacitorHttp.request` con `responseType: text` entregue el cuerpo sin transformar en Android (se programó con respaldo, no se ejecutó).
- La RPC y el panel contra GoTrue real con intentos fallidos (no existen en el registro).
- `fcm.ts` (ver arriba) y todo lo de FCM de extremo a extremo; el APK se compiló sin `google-services.json`.
- Las migraciones en producción (solo staging local; las aplica el flujo de despliegue).

## Fase VERDE sobre los hallazgos de QA (2026-11-21)

Decisiones de diseño y qué cambió. Los tests de QA no se tocaron.

| Hallazgo | Decisión |
|---|---|
| H-04 | La ventana de 2 min solo recuerda lo GUARDADO; descartar no la renueva. Misma huella, o mismo monto y comercio a menos de 45 s (el sistema reenvía el aviso al cambiar de minuto), se descarta (`DUPLICATE`). Entre 45 s y 2 min se guarda y se marca `possibleDuplicate` (el aviso lo anota); no se pierde una compra real. Un aviso sin comercio seguido (30 s) de uno con comercio y mismo monto completa el borrador (H-14). |
| H-05 | `list()` ya no caduca los `CONFIRMED`; solo salen al enviarse. «Guardar» agenda un recordatorio local (`ReminderScheduler`, alarma inexacta, 2 h y luego cada 24 h; se reagenda al conectar el servicio): «Tienes N gastos por enviar». |
| H-06 | `Draft.ownerKey` (clave opaca `usuario:hogar`). El plugin guarda el dueño activo (`setActiveOwner`); sin dueño no se captura (`NO_SESSION`); `listDrafts` solo devuelve los del dueño activo. |
| H-07 | `EncryptedDraftRepository`: todas las operaciones `@Synchronized` (más `update`). |
| H-08 | `CaptureProcessor.accepts` excluye el paquete propio; `setAllowedPackages` lo filtra. |
| H-09/H-10 | Parser: palabras de descarte nuevas (PIN, token, cupo, preaprobado, pago mínimo, rechazada, sospechosa, intento...), «$12 990» = 12990, «$12,990» ambiguo = sin gasto. `UnsafeChars` (control, formato, separadores) en comercio y en `nido://gasto`; igual en `bankNotice.ts` y `deepLink.ts`. |
| H-15/H-16 | `process` y el servicio capturan `Throwable`. `SecureKeyValueStore.get` borra el archivo ilegible y devuelve null (el usuario vuelve a iniciar sesión). |
| H-17 | `Draft.sourcePackage`. |
| H-02/H-03 | `draftExpenseId` (UUID del borrador, o hash estable) y `offlineQueue.enqueue` respeta el `id` que trae el gasto. |
| H-13 | `candidates.localDate` usa `Intl` con `America/Santiago` (pasa con `TZ=UTC`). |
| H-11 | Migración `20261121160000_reporte_error_sin_eventos_anonimos.sql`: sin `auth.uid()` el error se guarda pero NO se crea evento de seguridad. El cupo `anon` (30/10 min) sigue compartido solo entre anónimos. |

### Para el front-end (nativeBridge)
- `ContigoNative.setActiveOwner({ ownerKey })`: llamar al iniciar sesión con `ownerKeyOf(userId, householdId)`; `null` al salir. SIN dueño el teléfono no captura.
- `ContigoNative.wipeForAccountSwitch({ ownerKey })`: al cambiar de cuenta. Borra todas las colas `queue-*` (de cualquier hogar), los borradores y notificaciones que no son del dueño nuevo, y fija el dueño. Nunca borra la sesión nueva. `clearQueues()` borra solo las colas. `wipe()` también las borra y quita el dueño.
- `listDrafts()` devuelve además `pendingToSend`; en TS `pendingToSendCount(plugin)`. `NativeDraft` trae `possibleDuplicate?` y `sourcePackage?`.
- H-02 CERRADO: `useDetected` y `Register` pasan `{ ...form, id }` a la cola y `enqueue` respeta el id (el aviso anterior de esta nota ya no aplica).
- Las colas llevan en el nombre de archivo la etiqueta `queue.` (la clave sigue hasheada); las claves sin guion no cambian.

### No verificado
Alarmas y notificación de recordatorio en teléfono real, `SecureKeyValueStore.get` con Keystore real (AtomicFile no corre en JVM; solo se prueba `removeByPrefix` y la lectura del código), cambio de cuenta de punta a punta.

## Fase VERDE ronda 2 (QA ronda 2)
| ID | Decision |
|---|---|
| R2-01 | El descarte se mide en segundos (misma huella o mismo monto y comercio a menos de 45 s de lo ULTIMO GUARDADO), no por el minuto de la huella; la huella del parser no cambia. |
| R2-02 | Completar un borrador sin comercio ocurre una sola vez; con otro comercio despues son borradores separados. La notificacion se vuelve a mostrar con el comercio. |
| R2-03 | Sin sesion el aviso se guarda SIN dueno (invisible, sin notificacion), el resultado sigue siendo `NO_SESSION` y se cuenta `NoSession` en la salud. `setActiveOwner`/`wipeForAccountSwitch` lo asignan a la misma persona (`lastUser`, solo el usuario); a otra persona se borra. |
| R2-04 | Si la bandeja esta llena se purgan solo borradores de OTRO dueno de mas de 30 dias; lo de la persona activa jamas. Si sigue llena: `QueueFull` en la salud y notificacion «bandeja llena», nunca silencio. |
| R2-09 | Decimales sin separador de miles (`$12,99`, `$12.99`, `$12,5`) se descartan (Kotlin y TS); `,00` y `$12.990,50` siguen valiendo. |
| R2-10 | Solo se rechaza como comercio «3 cuotas/pagos» o un numero solo; «7-ELEVEN» y «99 Centavos» se conservan. |
| R2-13/14 | ZWJ entre emoji se conserva (Kotlin y TS); espacios Unicode (U+00A0...) pasan a espacio normal. |
| R2-15 | Migracion `20261121180000_ingesta_detalle_numerico.sql`: `count`, `status`, `window_s` solo enteros en rango. Idempotente, probada en staging. |

## Registro automático por banco y aviso de gasto mayor

### A) Registro automático (opt-in por banco, apagado por defecto)
Bancos (ids que ya usa `bankAuto.ts`): `santander`, `banco-estado`, `banco-falabella`, `banco-chile`. **No se inventó ningún nombre de paquete**: `candidatePackages` va vacío. La persona asocia el banco con la app real usando el «modo aprender» (`getRecentNotifyingApps`) y `setBankPackage`. Los parsers siguen siendo SINTÉTICOS: **no verificados con avisos reales** de esos bancos.

Un aviso se guarda solo (estado CONFIRMED, sin pulsar «Guardar») únicamente si: el paquete está asociado a un banco con guardado automático activo, hay sesión y el dueño del perfil coincide, es gasto (abonos nunca) con confianza ALTA, monto <= tope (inclusivo, default 50.000), hay categoría aprendida para el comercio y no es posible duplicado. Todo lo demás pide confirmación como antes.

Envío con la app cerrada: `ExpenseSyncWorker` (WorkManager, requiere red, retroceso exponencial desde 30 s) lee la sesión del Keystore (`contigo-auth`), hace `POST {apiBase}/rest/v1/expenses` sin cabecera Origin, con el id del borrador (mismo en cada reintento; 23505 = éxito), fecha en America/Santiago. 401 renueva la sesión una vez (solo con la app cerrada, para no chocar con supabase-js); 5xx/429/red reintenta; otro 4xx queda como rechazado y el gasto sigue en la cola cifrada con el recordatorio «Tienes N gastos por enviar».

Contratos en `nativeBridge.ts` (`ContigoNative.*`):
- `getBankPresets() -> { banks: [{ id, name, packageName|null, autoSave, candidatePackages }], maxClp }`
- `setBankPackage({ bankId, packageName|null })` (agrega el paquete a la lista de vigilados; `null` apaga el guardado de ese banco)
- `setBankAutoSave({ bankId, enabled })` rechaza con código `NO_PACKAGE` si no hay app asociada
- `setAutoCap({ maxClp })` (1 a 9.999.999.999)
- `configureSync({ apiBase })` con `VITE_API_BASE` (solo https): llamar al arrancar la app nativa
- `setAutoProfile({ ownerKey, userId, householdId, paidBy, shared, categories: [{ key, categoryId }] })`: llamar al iniciar sesión y cuando cambie el historial. `buildAutoCategories(history, validIds)` genera `categories` (clave exacta y `w:primera palabra`, igual que `learnedCategory`). Sin perfil vigente del dueño activo NADA se guarda solo ni se envía.
- `getSyncState() -> { state: 'idle'|'error', pending, lastSyncAt|null, lastError }`; `syncNow()`
- `listAutoSaved() -> { items: [{ id, amount, note, at, synced }] }` (14 días, tope 50) para «Guardados automáticamente»; `parseAutoSaved` valida.
- `undoAutoSaved({ id }) -> { undone, needsDelete }`: si aún no se envió lo borra del teléfono (`undone: true`); si ya se envió `needsDelete: true` y la app debe llamar `deleteExpense(id)` (el id es el del gasto) y luego `dismissAutoSaved({ id })`.
`wipe`, `wipeForAccountSwitch` y `clearCaptured` borran perfil y registro de guardados.

### B) Aviso «Tu pareja hizo un gasto mayor»
- Migración `supabase/migrations/20261122100000_alerta_gasto_mayor.sql`: tabla `big_spend_alert_prefs (user_id, enabled=false, threshold_clp=50000)` con RLS (solo la fila propia, sin escritura directa) y RPC `set_big_spend_alert(p_enabled, p_threshold_clp)` (rango 1 a 9.999.999.999, solo `authenticated`). Test: `supabase/tests/alerta_gasto_mayor.sql` (en staging, ROLLBACK).
- `web/src/lib/partnerAlerts.ts`: `partnerAlertStore` ya es la implementación real (lee la tabla, guarda por la RPC; `NotAvailableError` si la migración aún no está). El front solo la usa en vez del stub.
- `supabase/functions/notify`: para gastos, quien activó la preferencia y cuyo umbral <= monto recibe el título «Tu pareja hizo un gasto mayor» con monto y categoría; los demás, el aviso de siempre. Si la tabla no existe o falla la lectura, todos reciben el aviso normal. La lógica de selección es pura (`recipients.ts`) y se prueba con vitest (`web/src/lib/pushRecipients.test.ts`); Deno no está instalado aquí, así que `index.ts` NO se ejecutó.

## Fase VERDE ronda 3 (QA ronda 3)
| ID | Decisión |
|---|---|
| R3-01 | Tras insertar (o 23505), `ExpenseSyncer` llama `POST {apiBase}/functions/v1/notify` con el mismo token de la sesión del dueño; el cuerpo es solo `{"kind":"expense","id":...}` (sin monto ni comercio). `notify` marca el gasto de forma atómica, así que repetir la llamada no duplica avisos. Si `notify` falla (red, 5xx, 429, 401) el gasto ya está guardado: se registra solo la clase `NOTIFY` y el Worker reintenta; `notify` solo acepta gastos de menos de 5 min, pasado ese plazo no se insiste. |
| R3-02 | Antes de enviar se compara el `sub` del JWT con `userId` del perfil. Si no coincide: no se envía, se registra `OWNER` y se borra el perfil. Un token que no se pueda leer como JWT no se puede comprobar y se deja pasar (el servidor lo valida). |
| R3-04 | `setAutoProfile` rechaza con `OWNER_MISMATCH` si `ownerKey` no es el dueño activo; devuelve `{ ownerKey }`. Para R3-03 (front): llamar `setActiveOwner` y esperar su promesa ANTES de `setAutoProfile`, y tratar `OWNER_MISMATCH` como «otra persona entró, no reintentar». Con este rechazo una respuesta tardía de la persona anterior ya no deja su perfil guardado. |
| R3-05 | `clearCaptured` borra también el perfil automático. |
| R3-06/07 | `undoAutoSaved` corre bajo el mismo cerrojo que `syncOnce`. Solo devuelve `undone: true` si el borrador sigue en la cola del teléfono y no se envió; en cualquier otro caso (enviado, en vuelo, sacado por la app abierta) devuelve `needsDelete: true` y la app borra el gasto por id. |
| R3-08 | El registro de guardados lleva `ownerKey`; `listAutoSaved`, `undoAutoSaved` y `dismissAutoSaved` solo ven los de la persona activa. |
| R3-09 | Una fila rechazada (4xx) se marca `syncRejected` y no se reenvía sola ni tapa el éxito de las demás. Es visible: `listAutoSaved` trae `status: 'pending' \| 'synced' \| 'rejected'`, `getSyncState` trae `rejected` y `state: 'error'`, y `listDrafts` trae `syncRejected`. No cuenta en «gastos por enviar». |
| R3-10/11 | UUID validado con la forma real; la nota se corta sin partir pares sustitutos. |
| INFO | Un borrador de un banco con el guardado automático apagado llega con `bankAutoOff: true`; `planDrafts` lo pregunta aunque el modo global esté encendido (banco apagado = nunca solo). |
