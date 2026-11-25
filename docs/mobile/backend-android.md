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
   nativeApi.ts   → HTTP nativo con cabecera Origin exacta del Worker (sin Sec-Fetch-Site), VITE_API_BASE, x-request-id, tiempos de espera
   secureSession.ts → sesión de supabase-js en Keystore (sin localStorage)
```

El texto bruto del aviso vive solo dentro de `CaptureProcessor.process` y del parser: no se guarda, no se registra, no está en `ParsedCandidate` ni en el borrador (hay pruebas: el archivo cifrado no contiene monto ni texto, y `ParsedCandidate` solo expone 6 campos).

### Parser (`native/core`)
Módulo JVM puro. Orden: lista blanca exacta por paquete → descarte (clave, código, contraseña, oferta, descuento, cupón, saldo, rechazada, pago de cuota, moneda extranjera) → montos (`$`, `CLP`, `pesos`; centavos ignorados; 0 y ≥ 10.000.000.000 descartados) → tipo (abono/devolución = INCOME, retiro = EXPENSE con confianza LOW) → comercio (`en X`, `a X`, o `a X por` en transferencias; MAYÚSCULAS pasan a Título; sin comercio = MEDIUM) → cuota (`Cuota N de M`, `Primera cuota` + `M cuotas`, `N cuotas de $X`; una compra en cuotas se registra por el TOTAL desde el 2026-11-24, ver «Falabella/CMR y Billetera Google») → huella SHA-256 (paquete + texto normalizado + monto + minuto). Una clase por regla: `DiscardRules`, `MoneyExtractor`, `InstallmentExtractor`, `MovementClassifier`, `MerchantExtractor`, `Fingerprint`. El módulo se incluye en la app Android como build incluido (`includeBuild('../../native/core')`, coordenadas `cl.nido:parser`).

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
gradle -p native/core jvmTest                       # nucleo KMP (233 pruebas, ver kmp.md)
cd web/android && gradle :app:testDebugUnitTest       # Android: núcleo de captura, cola cifrada, registro de cierres (263 pruebas)
npm --prefix web test                                 # todo vitest (front: 1232 pruebas)
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
| H-06 | `Draft.ownerKey` (clave opaca `usuario:hogar`). El plugin guarda el dueño activo (`setActiveOwner`); sin dueño no se captura (`NO_SESSION`); `listDrafts` solo devuelve los del dueño activo. Control de dueño (2026-11-24): `removeDraft`, «Guardar»/«Ignorar» de la notificación y `consumePendingOpen` solo actúan sobre un borrador del dueño activo (`DraftActions.removeOwned`/`saveFromNotification`, `OwnerFilter.owns`/`openable`, comprobado dentro de la escritura); un id ajeno, sin dueño o inexistente es no-op y da el mismo resultado (`removeDraft` → `{ removed: 0 }`, sin rechazo; `{ removed: 1 }` si lo quitó). |
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

Envío con la app cerrada: `ExpenseSyncWorker` (WorkManager, requiere red, retroceso exponencial desde 30 s) lee la sesión del Keystore (`contigo-auth`), hace `POST {apiBase}/rest/v1/expenses` con la cabecera Origin del Worker (DEC-01 revisada; sin Sec-Fetch-Site), con el id del borrador (mismo en cada reintento; 23505 = éxito), fecha en America/Santiago. 401 renueva la sesión una vez (solo con la app cerrada, para no chocar con supabase-js); 5xx/429/red reintenta; otro 4xx queda como rechazado y el gasto sigue en la cola cifrada con el recordatorio «Tienes N gastos por enviar».

Reintento acotado (QA 2026-11-24, autoguardado sin red): el trabajo exige red (WorkManager lo lanza apenas vuelve), un gasto nuevo/«Enviar ahora»/perfil agenda con `REPLACE` (ya no queda en fila detrás de un reintento largo) y un fallo pasajero agenda el siguiente según `SyncRetryPolicy` (30 s duplicando, máx. 15 min, tope 48 intentos; REJECTED, NEEDS_PERSON y NO_SESSION no reintentan), no con el retroceso de WorkManager (hasta 5 h). Si la app abierta toma un guardado automático y llama `removeDraft`, `DraftActions.removeTakenByApp` lo marca enviado/avisado en el registro: antes quedaba «se enviará solo» 14 días aunque la app ya lo hubiera guardado o encolado.

Contratos en `nativeBridge.ts` (`ContigoNative.*`):
- `getBankPresets() -> { banks: [{ id, name, packageName|null, autoSave, candidatePackages }], maxClp }`
- `setBankPackage({ bankId, packageName|null })` (agrega el paquete a la lista de vigilados; `null` apaga el guardado de ese banco)
- `setBankAutoSave({ bankId, enabled })` rechaza con código `NO_PACKAGE` si no hay app asociada
- `setAutoCap({ maxClp })` (1 a 9.999.999.999)
- `configureSync({ apiBase })` con `VITE_API_BASE` (solo https): llamar al arrancar la app nativa
- `setAutoProfile({ ownerKey, userId, householdId, paidBy, shared, categories: [{ key, categoryId }] })`: llamar al iniciar sesión y cuando cambie el historial. `buildAutoCategories(history, validIds)` genera `categories` (clave exacta y `w:primera palabra`, igual que `learnedCategory`). Sin perfil vigente del dueño activo NADA se guarda solo ni se envía.
- `getSyncState() -> { state: 'idle'|'error', pending, lastSyncAt|null, lastError }`
- `listAutoSaved() -> { items: [{ id, amount, note, at, synced }] }` (14 días, tope 50) para «Guardados automáticamente»; `parseAutoSaved` valida.
- `undoAutoSaved({ id }) -> { undone, needsDelete }`: si aún no se envió lo borra del teléfono (`undone: true`); si ya se envió `needsDelete: true` y la app debe llamar `deleteExpense(id)` (el id es el del gasto) y luego `dismissAutoSaved({ id })`.
`wipe`, `wipeForAccountSwitch` y `clearCaptured` borran perfil y registro de guardados.
- `syncNow() -> { sent, failed, needsPerson, result }` (2026-11-24, aditivo; antes `void`): envía en un hilo propio con el mismo cerrojo que el trabajo en segundo plano y responde solo cuentas. `result` = `ALL_SENT`, `NOTHING_TO_SEND`, `NEEDS_PERSON`, `REJECTED`, `NO_SESSION`, `RETRY`, `FAILED` (el envío lanzó) o `IN_PROGRESS` (pasaron 20 s y sigue en curso); con `RETRY`, `FAILED` o `IN_PROGRESS` queda agendado `ExpenseSyncWorker`. Nunca rechaza.
- `clearPending() -> { removed }` (2026-11-24, nuevo): «Vaciar movimientos pendientes». Borra SOLO los PENDING del dueño activo (jamás un CONFIRMED) en una escritura, bajo el cerrojo del envío, y cancela solo sus notificaciones; sin dueño activo `removed: 0`. Keystore ocupado → rechaza `STORE_UNAVAILABLE` sin borrar nada (se puede reintentar).
- `clearCaptured() -> { unsentRemoved }` (2026-11-24, aditivo): «Borrar lo capturado» de Seguridad SIGUE siendo total (también lo guardado sin enviar y lo de otros dueños). `unsentRemoved` = confirmados sin enviar del dueño activo que se perdieron (contados bajo el cerrojo, antes de borrar); para avisar ANTES de llamar, contar los `CONFIRMED` de `listDrafts`. Si el Keystore no deja leer la cola, borra igual y `unsentRemoved` sale 0.

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

## Entrar con Google en la app (Credential Manager)
- `ContigoNative.isGoogleSignInSupported() -> { supported }` y `ContigoNative.googleSignIn({ nonce, serverClientId }) -> { idToken }` (rechaza con `code`: `CANCELLED`, `NO_ACCOUNTS`, `NETWORK`, `INVALID_NONCE`, `UNSUPPORTED`, `FAILED`). El plugin envía el SHA-256 hex del nonce al selector; Supabase recibe el nonce en claro.
- `web/src/lib/nativeGoogle.ts`: `signInWithGoogleNative()` (arma todo y devuelve `null` o un mensaje en español), `nativeGoogleAvailable()` (ID de cliente Y soporte del plugin) y `googleErrorMessage(code)`.
- `signInWithGoogle()` (oauth.ts) en nativo delega en ese flujo y NUNCA abre OAuth web; `loadGsi()` rechaza en nativo, así que `GoogleButton` cae solo al botón de respaldo, que ya llama `signInWithGoogle()`.
- Para el front: en nativo mostrar el botón de Google solo si `await nativeGoogleAvailable()` es true (hoy, sin ID de cliente, el botón de respaldo seguiría visible y mostraría el mensaje de «no disponible»).

## Actualización de la app desde GitHub

Contrato (`nativeBridge.ts`, plugin `ContigoNative`): `getAppInfo() -> {versionName, versionCode}`; `checkForUpdate() -> {available, versionName?, versionCode?, notes?, sizeBytes?}`; `downloadUpdate()` (evento `updateProgress {downloaded,total}`); `installUpdate()` (evento `updateInstall {status: confirm|installed|failed, error?}`); `canInstallUpdates() -> {allowed}`; `openInstallSettings()`; `discardUpdate()`.
Errores (propiedad `code` del rechazo; helper `updateErrorCode`): NO_NETWORK, RATE_LIMITED, INVALID_FORMAT, NO_ASSET, HOST_NOT_ALLOWED, TOO_LARGE, HASH_MISMATCH, DOWNGRADE, WRONG_PACKAGE, WRONG_SIGNATURE, INSTALL_NOT_ALLOWED (el front guía a Ajustes con `openInstallSettings`), INSTALL_FAILED, NOTHING_DOWNLOADED.
Versión: única fuente `web/package.json` (`version` X.Y.Z); `build.gradle` calcula `versionCode = major*10000 + minor*100 + patch` y `versionName`. Repositorio: `NIDO_UPDATE_REPO` al compilar (por defecto `Tufavo1/nido-finanzas`).
Flujo: GET anónimo (sin cookies ni identificadores; GitHub ve la IP) a `api.github.com/repos/<repo>/releases/latest` (GitHub ya excluye borradores; se descartan prereleases y versión <= instalada; timeout 20 s, respuesta máx. 256 KB). Se exigen los assets `nido-release.apk` y `nido-release.apk.sha256`. Descarga solo de github.com / objects.githubusercontent.com / release-assets.githubusercontent.com, https, cada salto de redirección validado (máx. 5), a `cache/updates/` privado (máx. 150 MB). Se verifica SHA-256 contra el `.sha256`, paquete, versionCode mayor y misma firma ANTES de instalar; si algo falla se borra el archivo. Instala con PackageInstaller (el sistema pide confirmar); al terminar o fallar se limpia. Código: `update/UpdateCore.kt` (puro, probado en JVM con dobles) y `update/UpdateAndroid.kt`.

## Detección automática de bancos, activación en un paso y diagnóstico

Causa del «no funcionan los avisos»: la lista de apps permitidas nacía vacía y todo se ignoraba hasta asociar cada banco a mano. Ahora el plugin detecta las apps de banco solo.

Detección (`CapturePrefs`, `BankDetection.kt`): consulta las apps con icono de lanzador (`<queries>` MAIN/LAUNCHER ya declarado; NO se usa `QUERY_ALL_PACKAGES`) y asocia por NOMBRE VISIBLE normalizado (minúsculas, sin tildes). Regla conservadora: se quitan palabras sueltas permitidas por banco («app», «chile», «móvil», «mi») y lo que queda debe ser exactamente un nombre conocido (Santander; BancoEstado/Banco Estado/CuentaRUT; Banco Falabella; Banco de Chile/Banco Chile/Mi Banco/Mi Pasaporte). «Santander Trade», «Banco Falabella Perú», «… Empresas», «CMR Falabella», etc. NO se asocian; se corrige a mano con `setBankPackage` (Avanzado). Limitación: «Mi Banco» podría coincidir con una app de otro país con ese mismo nombre. Se re-detecta al pedir `getDetectedBanks`, al activar y al conectarse el servicio. La lista que vigila el servicio es la elegida por la persona MÁS los paquetes de banco (detectados o asociados). No hay paquetes inventados; los nombres visibles NO están verificados en un teléfono real.

Contrato del plugin (nativo): `getDetectedBanks() -> {detected:[{bankId, appLabel, packageName, status: 'installed'|'seen'|'not_found'}]}`; `enableAllDetected()` y `setAutoSaveAll({enabled}) -> {enabled[], disabled[], withoutApp[]}` (activa captura + guardado automático solo de bancos con app, con el tope por defecto; sin app no hace nada y lo informa en `withoutApp`); `getCaptureDiagnostics() -> {items:[{atMillis, bankId?, reason, maskedText}]}`.
Contrato que ve la UI (`nativeBridge.ts`, `adaptDetectedBanks`/`adaptDiagnostics`): `getDetectedBanks() -> {banks:[{id, packageName}]}` (solo installed|seen, un paquete por banco) y `getCaptureDiagnostics() -> {items:[{reason, maskedText?, at}]}`. Motivos: NOT_AN_EXPENSE/AMBIGUOUS_AMOUNT/NO_AMOUNT -> NO_AMOUNT; INCOME; BANK_OFF; NO_SESSION/NO_PROFILE -> LOGIN_REQUIRED. Pasan tal cual (la UI muestra «No pude leerlo»): PACKAGE_NOT_ALLOWED, LOW_CONFIDENCE, DUPLICATE, QUEUE_FULL, CAP_EXCEEDED, CATEGORY_UNKNOWN, NOTIFICATIONS_OFF. Si el front quiere textos propios para ellos debe agregarlos.

Diagnóstico: buffer circular de 20, cifrado en el almacén seguro, SOLO local (no va a logs ni a client_errors ni se envía). Guarda motivo, banco, hora y el texto con dígitos reemplazados por `#` (se conservan letras, `$`, puntos y comas; tope 300 caracteres). Ojo: los nombres de comercios o personas en el texto se conservan; por eso solo lo copia la persona. Se borra con «Borrar todo lo capturado», al cambiar de cuenta y al cerrar sesión. Registra los avisos de apps permitidas rechazados por el parser (sin monto, no es gasto, abono) y, para bancos, por qué un gasto no se guardó solo.

Revisión del flujo: (1) sin dueño activo el aviso se guarda sin dueño (motivo NO_SESSION) y al iniciar sesión se adopta y se refresca la bandeja (antes no se refrescaba). (2) Perfil ausente -> pide confirmación (NO_PROFILE). (3) El primer gasto de un comercio nuevo (categoría no aprendida) NUNCA se guarda solo: queda PENDIENTE, aparece en la bandeja y la notificación propia ofrece «Guardar» (UN toque; queda confirmado y se envía al abrir la app o por el recordatorio; si el comercio ya tiene categoría aprendida se envía en segundo plano). A partir de ahí los gastos de ese comercio sí se guardan solos. (4) Con el permiso de notificaciones de Android 13 sin conceder el gasto queda en la bandeja y se anota NOTIFICATIONS_OFF. (5) Aviso con formato desconocido deja un diagnóstico NO_AMOUNT.

## Reescaneo de avisos que ya estaban en la barra

El servicio de escucha solo recibía avisos NUEVOS (`onNotificationPosted`): un aviso que ya estaba en la barra al activar el permiso, al reconectarse el servicio o al instalar la app se perdía. Ahora `NotificationCaptureService.rescanActive()` lee `activeNotifications` y los procesa por el MISMO camino (`CaptureProcessor.process`, con `sbn.postTime` como hora), solo de apps permitidas.
- Cuándo: al conectarse el servicio (`onListenerConnected`, después de detectar bancos) y con el método de plugin nuevo `rescanNotifications() -> {processed, connected}` (el front lo llama al pasar la app a primer plano; `connected=false` si el servicio no está conectado). Declararlo en `nativeBridge.ts` es del front.
- Sin duplicar: se guarda, cifrado y persistente, un anillo de 200 hashes SHA-256 de paquete+clave+hora (`SeenNotices`; jamás texto ni claves). `onNotificationPosted` también los marca. Este almacén NO se borra con el cierre de sesión (un gasto ya enviado no debe renacer desde la barra).
- Límites: ignora avisos de más de 24 h, máximo 50 por pasada (los más recientes), y un aviso que falla no bloquea al resto ni tumba el servicio (se cuenta en la salud). Mismas reglas de dueño: sin sesión se guarda huérfano y se adopta al iniciar sesión. La bandeja sigue teniendo su tope de 50 borradores.
- Modo aprender (`getRecentNotifyingApps`): ya registraba apps NO permitidas que avisan (solo paquete y hora) desde `onNotificationPosted`; ahora también las de la barra en cada reescaneo. Nunca guarda texto.

### Resultado de `rescanNotifications()` (botón «Buscar gastos»)

`{ connected, scanned, processed, alreadySeen, otherApps, reason }`. Solo números y un enum: jamás texto ni nombres de paquete.
- `scanned`: avisos activos de apps PERMITIDAS examinados (≤ 24 h, tope 50, los más recientes). `processed`: cuántos generaron un borrador nuevo. `alreadySeen`: cuántos ya estaban marcados en `SeenNotices` (no se reprocesan). `otherApps`: cantidad de avisos activos de apps NO permitidas (la propia app no cuenta). `connected`: el servicio de escucha está conectado.
- `reason` (UNA causa probable, en este orden): `LISTENER_OFF` (permiso de acceso a notificaciones apagado o servicio no conectado), `NO_BANK_APP` (no hay apps permitidas ni bancos detectados), `NOTHING_ACTIVE` (hay bancos pero ningún aviso activo de ellos en las últimas 24 h), `ONLY_SEEN` (todos los examinados ya estaban vistos), `OK`.
- Lógica pura en `ScanResult.of` (`capture/Rescan.kt`), probada con fakes para cada razón. Cambio de comportamiento: los avisos ya vistos ahora cuentan dentro del tope de 50 examinados.

## Tipos de aviso Falabella/CMR y contrato `kind` (2026-11-22)

Cuatro formas de aviso, con o sin el monto en el título (aviso partido: título «Transferiste $5.000» + cuerpo «a Juan Perez. Revisa más detalles en tu app»):

| Aviso | `kind` | ¿Se guarda solo? |
|---|---|---|
| «Compraste $X en COMERCIO» | `EXPENSE` | Sí, con banco activado, confianza ALTA, dentro del tope, perfil del dueño y sin duda de duplicado. Categoría: la aprendida del comercio o, si es nuevo, `defaultCategoryId` del perfil. Sin ninguna de las dos, pregunta. |
| «Recibiste $X» / «Te transfirieron $X» | `INCOME` | Sí, como **Ingreso extra** (mismas barreras y mismo tope que un gasto, sin comercio ni categoría). Abonos, devoluciones, reversas y anulaciones también son `INCOME` pero NO se guardan solos (`ParseResult.extraIncome = false`). |
| «Pagaste $X a tu CMR…» | `DEBT_PAYMENT` | Nunca: la persona elige la deuda. |
| «Transferiste $X a NOMBRE» (también «Transferencia realizada a NOMBRE por $X», «Hiciste una transferencia de $X a NOMBRE») | `TRANSFER_OUT` | Nunca: la persona decide si fue gasto o pago de deuda. `merchant` = destinatario (sin «Revisa más detalles…» ni ciudad), `account` = cuenta de origen si aparece («con tu …» o «desde tu …»). Confianza ALTA con destinatario, MEDIA sin él. «No transferiste» y transferencias fallidas o rechazadas se descartan. Un retiro sigue como gasto de confianza BAJA. |

**`kind` en el JSON** de `listDrafts`/`draftsChanged` (y en el borrador cifrado): es el nombre del enum de Kotlin, en MAYÚSCULAS, igual que hasta hoy: `'EXPENSE' | 'INCOME' | 'DEBT_PAYMENT' | 'TRANSFER_OUT'`. El resto de los campos no cambia (`id, amountClp, merchant, kind, confidence, installment, fingerprint, account, postedAtMillis, createdAtMillis, status, sourcePackage, ownerKey, possibleDuplicate, categoryId, autoSaved, syncRejected, bankAutoOff`). No se usan minúsculas: romperían los borradores ya guardados (`Kind.valueOf`) y el front actual (`DetectedInbox.tsx` compara con `'DEBT_PAYMENT'`).

**Notificación propia**: gasto = Guardar / Cambiar categoría / Ignorar; ingreso y pago de deuda = Revisar / Ignorar; transferencia = solo «Revisar», con el texto «Transferiste $X a NOMBRE: ¿gasto o pago de deuda?». Ingreso guardado solo: «Ingreso extra guardado» / «Guardé $X en Ingresos extra».

**Envío en segundo plano** (`ExpenseSyncer`): `EXPENSE` -> `POST /rest/v1/expenses` y luego `notify` a la pareja. `INCOME` -> `POST /rest/v1/incomes` con `{id, household_id, amount, source: 'Ingreso extra', received_on}` (`id` = id del borrador, UUID v4 = `draftExpenseId`; `received_on` = día del aviso en America/Santiago; `user_id` lo pone la base). Un ingreso es PRIVADO: jamás llama a `notify` ni sale a otro lado. `DEBT_PAYMENT` y `TRANSFER_OUT` nunca se envían (`pathOf`/`rowOf` devuelven null). `pendingToSend` cuenta gastos e ingresos confirmados.

**`setAutoProfile`** acepta el campo opcional `defaultCategoryId` (UUID). Perfil guardado:
`{"ownerKey","userId","householdId","paidBy","shared","categories":{...},"defaultCategoryId":"<uuid>"|null}`. Un perfil antiguo sin el campo o con un valor que no sea UUID sigue valiendo, con `defaultCategoryId = null` (comportamiento anterior).

**Registro de guardados solos** (`listAutoSaved`): cada ítem es `{id, amount, note, at, synced, status, kind}` con `kind` = `'EXPENSE' | 'INCOME'`; para un ingreso `note` = `'Ingreso extra'`. Un registro antiguo sin tipo se lee como `EXPENSE`. Deshacer (`undoAutoSaved`) es igual para ambos; si responde `needsDelete`, el front debe borrar la fila en `expenses` o en `incomes` según `kind`.

## Ronda 5: cifrado en reposo y captura más robusta (2026-11-22)

Detalle del cifrado y la tabla de datos en el informe de seguridad (documento privado, fuera del repositorio) («Cifrado en reposo, ronda 5»). Aquí, lo que cambia para la captura y el contrato del plugin. **Todo es aditivo**: `kind` sigue en MAYÚSCULAS, el JSON de borradores, `AutoProfile` y el registro de guardados solos no cambian.

### Captura
- **(a) Deduplicación por clave + contenido** (`NoticeLedger`, persistente y cifrado, solo SHA-256). Identidad = paquete + clave de Android (`sbn.key`) + `Notification.when` (o la hora de publicación si `when` = 0) + texto normalizado. Misma identidad = el sistema reenvió el MISMO aviso: `DUPLICATE` sin importar el tiempo ni si el proceso murió. Misma clave y mismo monto a menos de 10 min con el mismo `when`, o con el borrador anterior sin comercio y este con comercio: es una actualización con más detalle y **completa el borrador pendiente** (comercio, cuenta, cuotas) en vez de crear otro; si ya estaba confirmado no se toca. Un comercio distinto, otro monto, u otro `when` con el mismo texto son avisos nuevos (se guardan; entre 45 s y 2 min quedan como `possibleDuplicate` igual que antes). La ventana de 45 s / 2 min sigue para avisos sin clave.
- **(b) Más campos**: si `EXTRA_BIG_TEXT` y `EXTRA_TEXT` vienen vacíos se leen `EXTRA_TEXT_LINES` (InboxStyle, hasta 10 líneas), `EXTRA_MESSAGES` (MessagingStyle, los 5 últimos, solo el texto, nunca el remitente), `EXTRA_SUB_TEXT` y `EXTRA_SUMMARY_TEXT`. Cada campo se copia con tope de 4.000 y el texto final con tope de 2.000. Se descartan, mirando solo banderas (sin leer el texto), los resúmenes de grupo (`FLAG_GROUP_SUMMARY`) y los avisos fijos o de servicio (`FLAG_ONGOING_EVENT`, `FLAG_FOREGROUND_SERVICE`, `isOngoing`), también en el reescaneo. Lógica pura en `NoticeExtractor`.
- **(c) Estructura del aviso** (`NoticeShape`): el diagnóstico guarda (cifrado) qué campos traían contenido y su largo, nunca el contenido.
- **(d) Salud**: `getCaptureHealth` (abajo). El plugin pide `requestRebind` al abrir la app, en `getCaptureHealth` y en `rescanNotifications` si hay permiso y el servicio no está conectado (como máximo cada 30 s). La conexión «real» se mide por `NotificationCaptureService.instance` (la marca guardada puede quedar en «conectado» si el proceso murió al actualizar). Se guarda el `versionCode` con que se conectó por última vez para decir `sinceUpdate`.
- **(e) Parser**: «Giro/Giraste» es retiro (gasto de confianza BAJA, sin comercio, nunca se guarda solo); «$» seguido de espacio duro (U+00A0/U+202F) se lee. Pruebas de robustez genéricas en `ChileanBankVariantsTest` (Compra aprobada, Cargo, Giro, Abono/Depósito, Pago de cuenta, Transferencia; tildes, mayúsculas, `$` pegado o con espacio, miles con punto, CLP antes o después, `,00`; USD/US$/UF/EUR descartados; decimales ambiguos descartados). **Son textos sintéticos**: los únicos avisos reales verificados son los de Banco Falabella/CMR; **Santander, BancoEstado y Banco de Chile aún no tienen avisos reales verificados**. Ante la duda (sin comercio, retiro, transferencia, confianza no ALTA) el aviso queda PENDING. Para el front: `bankNotice.ts` replica las palabras de Kotlin y debería sumar «giro/giraste» como retiro (no lo toqué).
- **(f) Sin dueño**: igual que R2-03; el aviso huérfano también se anota en el registro, así que un reintento no lo duplica; la última persona (`lastUser`) ahora vive cifrada.
- **(g) Muerte a mitad de un aviso**: antes de crear un borrador se busca uno con la misma huella y la misma hora de publicación (cubre la muerte entre guardar el borrador y anotarlo). `FAILED` y `QUEUE_FULL` ya NO se marcan como vistos: el reescaneo los reintenta y el procesador reconoce el mismo aviso (sigue sin marcarse `NOT_A_MOVEMENT`; un aviso cuyos extras lanzan al leerse sí se marca).

### Contrato del plugin (campos nuevos, opcionales)
- **`getCaptureHealth() -> {state, listenerAllowed, connected, disconnectedSinceMillis|null, disconnectedHours|null, sinceUpdate, backgroundRestricted, batteryOptimized, lastEventAt|null, lastConnectedAt|null, whitelistCount, rebindRequested}`**. `state`: `OK` (leyendo) · `NO_ACCESS` (sin acceso a notificaciones) · `DISCONNECTED` (con acceso, Android no lo tiene conectado; `disconnectedHours` solo si se sabe desde cuándo) · `BATTERY_RESTRICTED` (conectado pero Android restringe la app en segundo plano: `isBackgroundRestricted` o grupo RESTRICTED) · `CONNECTING` (la app abrió hace menos de 60 s y el sistema aún no conecta el servicio). Orden: NO_ACCESS > CONNECTING/DISCONNECTED > BATTERY_RESTRICTED > OK. Hoy `adaptCaptureHealth` (front) entiende `OK`, `NO_ACCESS` y `DISCONNECTED`; para `BATTERY_RESTRICTED` y `CONNECTING` devuelve null (usa su propio cálculo): el front debe agregarlos si quiere textos propios. Lógica pura: `CaptureHealth.compute`, `RebindPolicy`.
- **`rescanNotifications`** agrega `rebindRequested: boolean` (las demás claves no cambian).
- **`getCaptureDiagnostics`**: cada ítem agrega `shape: {title, text, bigText, lines, linesChars, messages, messagesChars, subText, summary, truncated} | null` (largos en caracteres; `lines`/`messages` = cuántas), `fields: string[] | null` (campos con contenido, p. ej. `["title","text"]`) y `hint: 'EMPTY' | 'ONLY_TITLE' | 'ONLY_EXTRA_FIELDS' | 'NO_AMOUNT_IN_TITLE_OR_TEXT' | null`. Con `reason` NO_AMOUNT y `hint` NO_AMOUNT_IN_TITLE_OR_TEXT la pantalla puede decir «llegó sin monto en el título ni en el texto». Diagnósticos antiguos: `null`.
- **Errores nuevos**: `secureGet/secureSet/secureRemove` rechazan `RESERVED_KEY` para `auto-profile`, `auto-log`, `diag-log` y `capture-prefs`; `secureSet` y `setAutoProfile` rechazan `STORE_FAILED` si no se pudo cifrar (antes cerraban la app).
- **Cambio de comportamiento**: `wipe` borra además la configuración de captura cifrada; `wipeForAccountSwitch` borra la de la persona anterior (lista blanca, bancos asociados, guardado automático, tope, apps recientes).

### Límites y NO VERIFICADO
- Qué pone Banco Falabella en `Notification.when` y si reutiliza la misma clave de notificación: si una app fijara un `when` constante y reutilizara la clave, dos compras idénticas (mismo texto) en esa ranura se tomarían como reenvío. Con el `when` por defecto de Android (hora de creación) no ocurre. Verificar en teléfono (MacroDroid o `dumpsys notification`).
- `EXTRA_TEXT_LINES`/`EXTRA_MESSAGES` reales de un banco, `requestRebind` tras actualizar la app en un teléfono real, `isBackgroundRestricted` por fabricante, y que el sistema reconecte el servicio en menos de 60 s al abrir la app (el margen de `CONNECTING`).

## Billetera Google como fuente de avisos (2026-11-23)

Pedido del dueño: tomar también los avisos de compra de **Billetera Google** (Google Wallet). Ejemplo visto en pantalla: «Shell Vespucio 1828 F1  23 nov  CLP 20,000». **Los avisos de Wallet son SINTÉTICOS**: no hay ningún aviso real verificado (no se sabe qué va en el título y qué en el texto, ni el paquete exacto, ni si llega dos veces). Igual que Santander, BancoEstado y Banco de Chile. Para verificarlo: `docs/mobile/verificar-aviso-wallet.md`.

### Fuente
- `BankPresets`: nueva fuente `billetera-google` / «Billetera Google» (`BankPresets.WALLET_ID`), `candidatePackages` vacío. **No se fija el paquete** (`com.google.android.apps.walletnfcrel` es el habitual, pero no se toma como verdad): se detecta por nombre visible o se asocia a mano.
- `BankMatcher`: núcleos `billeteragoogle`, `billeteradegoogle`, `googlewallet`; palabra suelta permitida `app`. NO se asocian «Wallet», «Billetera», «Google Pay», «GPay», «Samsung Wallet», «Apple Wallet», «Mercado Pago Wallet», «Tenpo Wallet», etc. (se asocian a mano con «Si no aparece tu banco»).
- Al ser una entrada más de `BankPresets.ALL`, aparece sola en `getBankPresets`, `getDetectedBanks`, `enableAllDetected`/`setAutoSaveAll` (`withoutApp` ahora puede traer 5 ids) y en la lista vigilada. No hay otras listas de ids en Kotlin.
- **Front**: `web/src/lib/bankAuto.ts` tiene `BANKS` fijo con 4 bancos y `parseBankPresets`/`parseDetectedBanks` (`bankConsent.ts`) descartan ids que no estén ahí: sin el parche Wallet NO aparece en la UI aunque el nativo la detecte. Parche: un parche privado (fuera del repositorio) (agrega `{ id: 'billetera-google', name: 'Billetera Google' }` y ajusta `bankAuto.test.ts`: 4 → 5 y una prueba nueva). `git apply --check` limpio; aplicado en una copia del front fuera del repo: `tsc -b` sin errores y vitest 1167 pruebas verdes (la única suite que falló en la copia, `qaRonda3.test.ts`, no resuelve `../../../supabase/functions/notify/recipients` fuera del repo; en el árbol real pasa y sus reglas sobre `bankAuto.ts` se cumplen). No hay íconos por id.

### Lectura del aviso (`native/core`, `NoticeStyle.WALLET`, `WalletNotice`)
`parseDetailed(pkg, title, text, postTime, style = BANK, utcOffsetMillis = -3 h)`: los parámetros nuevos son opcionales; el estilo lo decide `CaptureProcessor` por la FUENTE (`bankOfPackage == billetera-google`), nunca por el texto. Un Wallet asociado a mano a la lista blanca sin la fuente «Billetera Google» se lee como banco (peor comercio, mismo monto con «CLP»).
- Título y texto se juntan SIEMPRE (salto de línea): se aceptan todo en el título; título = comercio y texto = «23 nov CLP 20,000» o «CLP 20,000 · 23 nov»; título = «CLP 20,000» y texto = comercio; separadores ` · `, ` • `, ` - `, `|`, salto de línea; con o sin tarjeta al final.
- **Monto**: «CLP 20,000» = 20.000 (coma de miles, grupos exactos de 3), «CLP 1,250,000», «CLP 20.000», «CLP 20000», «20,000 CLP», «$ 20,000». Ante decimales o grupos raros («CLP 20,00», «CLP 20,000.50», «CLP 20.000,50», «CLP 20,0000») NO hay monto. Si «Shell Vespucio 1828 CLP 20,000» choca «1828 CLP» con «CLP 20,000», gana la marca delante. Varios montos distintos = confianza MEDIA.
- **Moneda extranjera** (todas las fuentes, `DiscardRules`): además de USD/US$/EUR/€/UF, ahora COP, ARS, PEN, MXN, BRL, GBP, JPY, CAD, AUD, CHF, CNY, UYU, BOB, PYG (en mayúsculas y pegadas a un número), £ y R$: se descartan, nunca se convierten.
- **Estilo banco**: solo cambia que «CLP 20,000» / «20,000 CLP» (coma de miles CON la marca CLP) ahora se leen; «$12,990» sigue siendo ambiguo y todas las pruebas existentes (FalabellaNotices, CmrNotice, TitleSplit, ChileanBankVariants, fixtures.json) pasan sin tocarlas.
- **Comercio**: el primer trozo que queda con letras tras quitar monto, fechas, horas, tarjeta, separadores y relleno («Compra en», «Pagaste … en», «Pago», «Billetera de Google», «Google Pay», «con tu»…). Conserva número de calle y código de local («Shell Vespucio 1828 F1»); MAYÚSCULAS a Título; caracteres invisibles fuera; tope 60.
- **Cuenta**: «Visa ••1234» → `Visa ·1234`, «Tarjeta ••1234» → `Tarjeta ·1234`, «Mastercard •••• 5678», «Débito», «Crédito». Solo los ÚLTIMOS 4 dígitos, aunque venga un número largo.
- **Fecha** («23 nov», «23 de nov.», «5 SEPT», «septiembre», «hoy», «ayer»; meses ene feb mar abr may jun jul ago sep sept set oct nov dic, con o sin punto, en mayúsculas): se reconoce y se quita del comercio; **la hora del borrador sigue siendo `postTime`**. Si la fecha del texto queda a más de 36 h fuera del día que nombra (antes de su inicio o después de su fin, zona America/Santiago, año elegido cerca de postTime) → `ParseResult.staleDate = true`: el gasto queda PENDING y el diagnóstico dice `STALE_DATE`.
- **Qué es compra**: solo compras con tarjeta → `EXPENSE` (nunca `DEBT_PAYMENT`, `TRANSFER_OUT` ni `INCOME`). ALTA con comercio y un monto CLP; MEDIA sin comercio. Reembolso/Devolución/Refund/reversa/anulación → `INCOME` confianza BAJA, `extraIncome = false` (nunca se guarda solo). Se DESCARTAN: ofertas, promociones, descuentos, tarjeta agregada / lista / por vencer, verificaciones, «pendiente», rechazada/declinada/fallida/cancelada, transferencias, «recibiste», retiros, y pases/entradas/boletos/vuelos sin monto.

### Guardado automático
Mismas barreras que un gasto de banco: fuente «Billetera Google» con guardado activado, sesión y perfil del dueño, confianza ALTA, monto ≤ tope, sin posible duplicado, categoría aprendida del comercio o `defaultCategoryId`, y además fecha del texto no vieja. Nada nuevo en el envío (`ExpenseSyncer`).

### Regla CROSS-FUENTE (banco + Wallet)
La misma compra puede avisar por la app del banco y por Wallet, con comercios distintos («SHELL VESPUCIO» vs «Shell Vespucio 1828 F1»). Regla (`PurchaseMemory`, en `CaptureProcessor` antes de la ventana de 45 s / 2 min):
- Dos `EXPENSE` de **paquetes distintos**, con el **mismo monto** y `postTime` a **menos de 10 min** son la misma compra. Gana la primera; la segunda devuelve `DUPLICATE`, no crea borrador y queda en el diagnóstico como `DUPLICATE`.
- Si la primera sigue PENDING y no tenía comercio, la segunda la completa (comercio, su confianza, cuenta si faltaba) una sola vez y se vuelve a mostrar la notificación; no se crea otra.
- Si la primera ya se guardó sola y se envió (salió de la bandeja), o la persona la ignoró, la segunda igual se descarta: la memoria es persistente (cifrada, almacén `seen`, clave `purchase-memory`; NO se borra al cerrar sesión, igual que el registro de avisos), 26 h y 200 entradas, y sobrevive a la muerte del proceso.
- Emparejamiento uno a uno: cada compra acepta como mucho un aviso de cada otra fuente. Dos compras reales del mismo monto en el banco, cada una con su espejo en Wallet, quedan dos. Dentro de la MISMA fuente nada cambia. Pagos de deuda, transferencias, ingresos y gastos de confianza BAJA (retiros/giros) no participan.
- **Por qué 10 minutos**: el aviso del banco y el de Wallet son de la misma transacción, pero cada app lo publica cuando le llega su propio mensaje (el banco desde su autorizador, Wallet desde la red de la tarjeta); con red móvil mala, Doze o el teléfono dormido, uno puede llegar varios minutos después. 2 min (la ventana de siempre) dejaría pasar duplicados; 30 min fusionaría más compras reales. 10 min cubre el retraso razonable con un costo acotado. **NO VERIFICADO**: el retraso real entre ambos avisos (anotarlo con la guía).
- **Riesgo residual**: dos compras REALES distintas del mismo monto, avisadas por fuentes distintas en menos de 10 min (p. ej. un café de $2.500 pagado con Wallet y otro de $2.500 con una tarjeta de otro banco), se fusionan en una: se pierde la segunda. Como la segunda queda en el diagnóstico (`DUPLICATE`), la persona puede agregarla a mano. Se prefirió este riesgo a duplicar cada compra pagada con Wallet.

### Contrato del plugin (solo aditivo)
- `getBankPresets` / `getDetectedBanks` / `setAutoSaveAll`: una fuente más, id `billetera-google`.
- `getCaptureDiagnostics`: motivo nuevo `STALE_DATE` (la UI lo muestra tal cual hasta que el front le ponga texto: «El aviso era de otro día»). Los diagnósticos de Wallet usan una máscara estricta (cada palabra queda con su inicial y `*` salvo palabras de formato como CLP, meses, Visa; dígitos `#`), porque el comercio va al inicio sin «en».
- **`clearDiagnostics({ atMillis? }) -> { removed }`** (2026-11-24): «Borrar» / «Borrar todos» de «Avisos que no pude leer». Con `atMillis` (entero ≥ 0) borra las entradas de esa hora; con `{}` borra todas (bloque cifrado y su `.bad`). Solo el diagnóstico local: no toca borradores, colas, perfil, registro de guardados ni anti duplicados (a diferencia de `clearCaptured`). `atMillis` inválido → `INVALID_ARGUMENT` (nunca «todas»); fallo de lectura/escritura (p. ej. Keystore ocupado) → `FAILED` sin borrar nada, se puede reintentar.
- Borradores: sin campos nuevos. `kind` sigue en MAYÚSCULAS (`EXPENSE`; `INCOME` para reembolsos). `account` puede ser `Visa ·1234`. `sourcePackage` = paquete de Wallet.

### Pruebas
- `native/core/.../WalletNoticeTest.kt` (19): montos CLP con coma/punto/sin separador/sufijo/`$`, ambiguos y extranjeros, todas las particiones del ejemplo, meses, cuenta con 4 dígitos, confianza, fecha vieja (incluye fin de año), qué se descarta, reembolsos, estilo banco intacto.
- `web/android/.../WalletCaptureTest.kt` (21): detección por nombre (y falsos positivos), preset, guardado solo con categoría aprendida o general, preguntas (fuente apagada, sin comercio, tope, fecha vieja), reembolso, descartes, y la regla cross-fuente: banco→Wallet, Wallet→banco, completar comercio, primero ya enviado, muerte del proceso, montos distintos, 11 min, 9 min 59 s, misma fuente dos veces, dos compras con espejo, reenvío del espejo, pago de deuda no se cruza, memoria solo con hashes, diagnóstico enmascarado.
- `BankDetectionTest`: migración deliberada (comentada) 4 → 5 fuentes sin app.

### NO VERIFICADO (necesita teléfono)
Paquete real que publica el aviso (podría ser Wallet o Google Play services: si fuera `com.google.android.gms`, NO se detecta por nombre y asociarlo a mano metería en la lista todos los avisos de Play services), qué va en título y texto, si el aviso usa `EXTRA_BIG_TEXT`/`InboxStyle`, si llega con el filtro `alerting|silent` del listener (es un aviso normal, no persistente ni conversación, así que debería), el idioma/formato con el teléfono en otro idioma («Nov 23», «$20,000.00»), el retraso real banco vs Wallet, y si Wallet reenvía o actualiza el mismo aviso.

## Gasto con débito o tarjeta de crédito y saldo informado (2026-11-23)

Migración `20261123120000_gasto_con_tarjeta.sql` (aditiva e idempotente). Modelo de dos cuentas: el saldo de la débito es sueldo + ingresos extra − gastos pagados con **débito** − pagos a deudas. Un gasto con **tarjeta** no baja la débito: sube el cupo utilizado de esa tarjeta; la débito baja recién cuando se paga la tarjeta (un `debt_payments` como siempre).

### `expenses`
| Columna | Tipo | Valores | Notas |
|---|---|---|---|
| `payment_method` | `text not null default 'debito'` | `'debito'` \| `'tarjeta'` (minúsculas, sin tilde) | Si no se manda queda `'debito'`. Todo lo guardado antes quedó `'debito'`. `null` explícito se rechaza. |
| `card_debt_id` | `uuid null` → `debts(id)` | id de una deuda `kind = 'tarjeta'` | Solo con `payment_method = 'tarjeta'`. Puede ir `null` aunque sea tarjeta (tarjeta aún no registrada). Si la deuda se borra, queda `null` y el gasto sigue siendo `'tarjeta'`. |

Reglas que aplica la base (insert y update):
- `card_debt_id` con `payment_method = 'debito'` (o sin mandarlo) → `23514`. Para volver a débito, mandar **ambos**: `{ "payment_method": "debito", "card_debt_id": null }`.
- La tarjeta tiene que ser del mismo hogar, de tipo `tarjeta`, y una que quien guarda pueda editar: de los dos (`owner_id null`) o propia. Si es personal, el gasto tiene que tener `paid_by` = su titular. Si no se cumple: `42501` («Tarjeta no válida para este gasto») o `23514` (no es tarjeta / tarjeta personal de otra persona como pagadora). La app debe ofrecer solo las deudas `kind = 'tarjeta'` visibles con `owner_id` null o igual a la persona.
- Editar otras columnas (monto, nota, categoría) de un gasto ya cargado a una tarjeta no vuelve a revisar la tarjeta.

### `debts`
| Columna | Tipo | Valores |
|---|---|---|
| `reported_balance` | `bigint null` | 0 ≤ valor < 10.000.000.000 (CLP, cupo utilizado del estado de cuenta) |
| `reported_at` | `date null` | fecha del estado de cuenta; ni futura ni anterior a 2000 |

Van **juntos o ninguno** (`23514` si llega uno solo). Para borrar el saldo informado: ambos `null`. Cuando existe, es la verdad para esa deuda (el cliente decide cómo combinarlo con lo calculado). Se leen y editan con las mismas reglas de siempre de `debts` (privacidad `share_debts`, solo deudas de los dos o propias).

### Cómo enviarlas
- **Kotlin (`ExpenseSyncer.rowOf`)**: sin cambios obligatorios; la fila actual sigue válida y queda `'debito'`. Para un aviso de compra con tarjeta de crédito: agregar `"payment_method": "tarjeta"` y, si la app conoce la tarjeta, `"card_debt_id": "<uuid>"`. Nunca mandar `card_debt_id` sin `"payment_method": "tarjeta"`.
- **Front**: `insert` de `expenses` acepta ambas columnas; `update` por columnas también. Al **deshacer** una conversión o restaurar un respaldo, reinsertar el gasto con su `payment_method` y `card_debt_id` (si la tarjeta ya no existe, mandar `card_debt_id: null`). Al restaurar, las deudas van antes que los gastos.
- Pruebas: `bash docs/mobile/qa/e2e-ronda6.sh` (incluye la ronda 5 completa como regresión).

## Falabella/CMR y Billetera Google: casos chilenos (2026-11-24)

Pruebas: `native/core/.../FalabellaWalletCasosTest.kt` (20) y `web/android/.../FalabellaWalletFlujoTest.kt` (11). Textos SINTÉTICOS con el formato real de Falabella; Wallet sigue sin avisos reales verificados.

- **Moneda extranjera**: `ParseRejection.FOREIGN_CURRENCY` (antes `DISCARDED`) y `DiagReason.FOREIGN_CURRENCY` en el diagnóstico. Se evalúa DESPUÉS de las palabras de descarte (una clave con «USD» sigue siendo clave). Suma «9,99 dólares». Nunca crea borrador: no hay monto en pesos que mostrar (el front descarta `amountClp < 1`). Para el front: `adaptDiagnostics` deja pasar el motivo tal cual; falta su texto («Compra en moneda extranjera: anótala a mano en pesos»).
- **Cuotas** (REEMPLAZADO el 2026-11-24, ver línea siguiente): «N cuotas de $X» = cuota 1 de N por $X (decisión 2, igual que «Primera cuota»). «en N cuotas» (N ≥ 2) sin valor de cuota: el monto es el total y queda `ambiguousAmount` (pendiente), también en Wallet.
- **Compra en cuotas por el TOTAL, siempre pendiente** (decisión del dueño 2026-11-24, reemplaza la decisión 2): «$30.000 en 3 cuotas de $10.000» → `amountClp` 30.000, `installment` null, `installmentRole` `PURCHASE`, `installmentCount` 3, `installmentValueClp` 10.000 (null si el aviso no lo dice); nunca se guarda solo (`AutoCaptureRules.decide` → ASK) y el diagnóstico dice `INSTALLMENT_PURCHASE`. Sin total («12 cuotas de $9.990») no se inventa: `amountClp` = la cuota, `installment` 1/12, `ambiguousAmount`, motivo `INSTALLMENT_TOTAL_UNKNOWN`. «Cuota 2 de 6 por $15.000» sin frase de compra = `PRIOR_CHARGE` (cobro de una cuota anterior, no gasto nuevo), motivo `INSTALLMENT_CHARGE`; ni este ni el sin total ofrecen «Guardar» en la notificación. Banco (total) + Billetera (mismo total) a < 10 min ya se deduplican y el borrador pendiente adopta las cuotas del espejo; si el banco solo da la cuota y Billetera el total, siguen siendo dos borradores. Nota al enviar: «Comercio (3 cuotas de $10.000)» (`ExpenseNote`).
- **Clasificación**: «Se anuló / Anulamos / Reversamos / fue devuelta» = `INCOME` que no se guarda solo. «Recibimos tu pago», «Pago recibido», «Pago de tu CMR» = `DEBT_PAYMENT`. «Avance»/«Súper Avance» = retiro (confianza BAJA, sin comercio).
- **Aviso viejo en bancos**: `staleDate` ahora también para avisos de banco (antes solo Wallet), con fechas «10 nov», «10/11/2026», «10-11-2026» y «el 10/11» (sin «el» no: «cuota 1/3» no es fecha).
- **Comercio**: «COMUNA CL» o «COMUNA CHILE» al final se quita solo si es una comuna conocida («COPEC LAS CONDES SANTIAGO CL» → «Copec Las Condes»). Ojo: una categoría aprendida con el nombre antiguo («Copec Las Condes Santiago Cl») no se reconoce con el nuevo.
- **Medio**: «Redcompra» y «CuentaRUT» = débito. Marca sola (Visa/Mastercard/Amex) sigue `UNKNOWN`.
- **Wallet en inglés**: «Tap to pay», «You paid … at COMERCIO» ya no quedan como comercio.
- **Detección de Billetera**: además del nombre visible, el paquete público `com.google.android.apps.walletnfcrel` se reconoce como Billetera Google aunque se llame «Google Pay» o «Wallet». `com.google.android.gms` NO se vigila nunca solo. `candidatePackages` sigue vacío (contrato del front sin cambios).
- ~~Pendiente conocido: compra CMR en cuotas avisada por el banco (cuota $10.000) y por Wallet (total $30.000) NO se deduplican~~ Resuelto el 2026-11-24 cuando el banco informa el total (ahora ambos son $30.000); sigue pendiente si el banco solo informa la cuota.
