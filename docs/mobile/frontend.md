<!-- Copyright (c) 2026 Dinovance -->
# Front-end móvil: decisiones, componentes y cómo probar (2026-11-21)

Alcance: `web/src/components`, `screens`, `styles.css`, `App`/`Shell`/`main` y los módulos `lib/` de la lista del front. Todo degrada con elegancia en el navegador: lo nativo se activa solo si `isNative()` (`lib/platform.ts`, usa `Capacitor.isNativePlatform()`).

## Decisiones
- **Lógica fuera de la vista.** Textos y reglas viven en `lib/` (puros y con tests): `screenState` (pantalla de error/vacío/permiso), `toastQueue` (cola de avisos), `backNav` (qué hace «atrás»), `pull` (deslizar), `confirmForm`, `securityPanel`, `licenses`, `lockPrivacy`. Los componentes solo dibujan.
- **Un solo sistema de avisos.** `useToasts` envuelve `toastQueue` (uno a la vez, cola, deduplicación, acción Deshacer/Reintentar, error = `role=alert`, resto = `role=status`). `Notify` sigue siendo `(texto, tipo?, acción?)`, así que las pantallas existentes no cambian. Los avisos de éxito y error disparan la háptica.
- **Una sola pantalla de estado.** `StatePage` dibuja cualquier `ScreenSpec`; `ErrorPage` (por código de respuesta) y `ErrorBoundary` la usan. El error boundary deja «Reintentar» 2 veces y a la tercera recarga la app. `kindForStatus` traduce código → tipo de error sin depender de `toAppError`.
- **Skeletons** (`Skeleton`, `SkeletonCard/List/Chart/Screen`): salen del color del texto (sirven en claro y oscuro) y se detienen con «reducir movimiento». Reemplazan al spinner de pantalla completa en Shell y en el panel de administración.
- **Hojas inferiores:** `Modal` ya es una hoja inferior (agarre, arrastre de foco, Esc); ahora se registra en `lib/overlays` para que el botón atrás de Android la cierre primero.
- **Tokens:** `--sp-*`, `--fs-*`, `--r-sm/md`, `--skel*` en `styles.css` (bloque «identidad»). Áreas táctiles subidas a 48 px.
- **Licencias:** `LicensesCard` importa `package-lock.json?raw` bajo demanda (chunk aparte de ~314 kB, 65 kB gzip) y usa `inventoryFromLock` → `checkLicenses` → `thirdPartyNotice`. Incluye dependencias de desarrollo.
- **Contrato con el backend:** `ConfirmExpense` recibe un `ExpenseDraft` (tipo de `lib/candidates.ts`, que arma `candidateToDraft` con `suggestCategory`). `NotificationPermission` recibe el permiso y callbacks; no importa `nativeBridge` (no existe aún).

## Componentes y módulos nuevos
| Qué | Dónde |
|---|---|
| Skeletons | `components/Skeleton.tsx` |
| Aviso con acción | `components/Toast.tsx`, `lib/useToasts.ts`, `lib/toastQueue.ts` |
| Pantallas de estado | `components/StatePage.tsx`, `ErrorPage.tsx`, `ErrorBoundary.tsx`, `EmptyState.tsx`, `lib/screenState.ts`, `lib/screenStatus.ts` |
| Permiso de notificaciones (guiado) | `components/NotificationPermission.tsx` |
| Confirmar gasto | `components/ConfirmExpense.tsx`, `lib/confirmForm.ts` |
| Acerca de / licencias / pie | `AboutCard.tsx`, `LicensesCard.tsx`, pie en `screens/Security.tsx` |
| Botón atrás, barra de estado, teclado, splash | `lib/useBackButton.ts`, `backNav.ts`, `overlays.ts`, `nativeChrome.ts` |
| Háptica (con opción en Ajustes > Apariencia) | `lib/haptics.ts`, `components/HapticsToggle.tsx` |
| Actualizar al deslizar | `lib/usePullToRefresh.ts`, `pull.ts`, `components/PullIndicator.tsx` |
| UI optimista con reversa | `lib/optimistic.ts` (`runOptimistic`) |
| Panel de seguridad (admin, solo lectura) | `components/SecurityPanel.tsx`, `SecurityPanelParts.tsx`, `lib/securityPanel.ts`, `lib/useSecurityOverview.ts`, pestaña «Seguridad» en `screens/Admin.tsx` |

Panel de seguridad: consume `security_overview(p_hours)`; `parseOverview` descarta lo que no tenga la forma esperada y trata un estado de salud desconocido como «caído». La gravedad se muestra con texto y símbolo además del color. Siempre se ve el aviso de que son INDICIOS y no garantiza detectar todo ataque.

## Integración de extremo a extremo (fase 2)
Flujo: aviso del banco → plugin (borrador cifrado) → `useDetected` → bandeja o guardado → gasto (id idempotente) → cola sin conexión si falla la red.
- **Ajustes > Captura de gastos** (`CaptureSettings`): monta `NotificationPermission` con `openPermissionGuide`; interruptor «Detectar mis gastos» (apagado = `setAllowedPackages([])`, la lista se recuerda); lista blanca y **modo aprender** (`CaptureAppsPicker`, usa `readRecentApps`: solo nombre y paquete); modo automático (apagado por defecto, tope 20/50/100/200 mil, regla `decideCapture`); compartido por defecto; ocultar montos en bloqueo (`setHideOnLockScreen`); «Borrar todo lo capturado» (`clearCaptured`, no cierra la sesión). En la web muestra «Solo está en la app del teléfono». Preferencias en el almacén seguro (`secureGet/secureSet`, clave `capture-config`), nunca en localStorage.
- **Bandeja «Gastos detectados»** (`DetectedInbox`, pestaña interna `inbox`): tarjeta en Inicio + insignia en la pestaña Inicio. Vacía los borradores al abrir y al reanudar (`useAppResume`) y con el evento `draftsChanged`. Cada uno: Revisar y guardar (abre `ConfirmExpense` precargada con `candidateToDraft` + `suggestCategory`), Cambiar categoría (hoja `CategoryPicker`, guarda de una) e Ignorar. Lo ya confirmado en la notificación y lo que cumpla el modo automático se guarda solo (`planDrafts`). Guardar muestra «Deshacer» 10 s. Sin red: `offlineQueue` + aviso «Reintentar»; la cola se vacía al abrir, al reanudar y al volver internet (`useExpenseQueue`).
- **Enlace nido://gasto** por una sola vía: `appUrlOpen` (`useDeepLink`), validado por `deepLink.ts`, con guarda de 10 s contra duplicados (`linkGuard`).
- **Botón atrás con cambios sin guardar:** `dirtyForms` (Registrar lo marca) + `backAction` → `ConfirmLeave` «¿Salir sin guardar?». «Atrás» en Confirmar gasto lo cierra y el borrador sigue en la bandeja.
- **Registrar con UI optimista** (`runOptimistic`): vuelve al inicio al instante; el aviso «Gasto registrado» (con Deshacer 10 s) sale cuando el servidor confirma; si falla, el gasto queda en la cola.
- **Licencias:** el chunk (~314 kB) se carga bajo demanda y está fuera del precache del service worker (`globIgnores` en `vite.config.ts`; precache 1286 → 1015 KiB).

### Límites conocidos
- **Modo automático «por app» no se implementó:** el borrador del plugin no trae el paquete de origen, así que no se puede aplicar por app; el modo y el tope son globales.
- **«Pausa»** se resume en el interruptor de captura (sin temporizador).
- Si el primer envío tuvo éxito pero se perdió la respuesta y luego falla la red, el gasto puede entrar a la cola con otro id (riesgo bajo de duplicado; `offlineQueue.enqueue` genera su propio id).
- La clave del almacén de la cola es `queue-<id del hogar>`: no se comprobó que el plugin acepte ese formato de clave.
- Pendiente: usar `EmptyState` también en Metas; los gastos recién guardados no se muestran en pantalla antes de la confirmación del servidor (la parte optimista es la navegación).

## Correcciones de QA (fase 3)
- **H-01:** `wipeSessionData()` ahora también llama a `ContigoNative.wipe()` en la app nativa (sesión, cola cifrada, borradores, configuración). Si entra otra persona sin cerrar sesión, `App.tsx` llama a `wipeForAccountSwitch()` (borra lo capturado y la configuración; NO usa `wipe()` porque borraría la sesión nueva). Pruebas: `wipe.native.test.ts` (QA) y `wipe.switch.test.ts`.
- **H-12:** `lib/safeLog.ts` (`logError(err, pantalla)`): a la consola solo va el tipo de error (`toAppError(...).kind`) y al servidor un reporte por `report_client_error` (`clientReport`), una vez por minuto por tipo y pantalla; nunca mensaje, detalles ni montos. Reemplaza todos los `console.error(e)` de `src/` (no solo los 8 del flujo de captura).
- **H-03 (lado front):** `useDetected` usa `draftExpenseId(borrador.id)` en vez de un Map en memoria.
- **H-04 (interfaz):** la bandeja marca «Posible duplicado» con explicación y las opciones «Conservar ambos» y «Descartar este». Detecta por monto + comercio entre borradores (`duplicateMarks`) y respeta un campo opcional `possibleDuplicate` si el plugin lo envía. «Conservar ambos» vale solo durante la sesión de la app.
- **H-05 (interfaz):** `UnsentBanner` (en toda la app): «Tienes N gastos por enviar» con «Enviar ahora» cuando hay borradores confirmados con «Guardar» que no se pudieron enviar (cuenta lo que queda en la bandeja; reintenta con `sendNow`). Cuando `nativeBridge` exponga un contador o la marca de duplicado propios, basta conectarlos en `lib/draftFlags.ts`.

## Cierre de H-02 y conexión con el plugin (fase 4)
- **H-02:** `useDetected` y `Register` encolan con `{...form, id}` (`formWithId`, id de `draftExpenseId`), así la cola reenvía con el mismo id del primer intento y 23505 cuenta como éxito. Prueba de la lógica de extremo a extremo: `idFlow.test.ts`.
- **Dueño activo:** `useDetected.load` llama `setActiveOwner(ownerKeyOf(usuario, hogar))` antes de leer borradores (al abrir, reanudar y al cambiar de hogar). Sin dueño el teléfono no captura.
- **Cambio de cuenta:** `wipeForAccountSwitch()` llama `ContigoNative.wipeForAccountSwitch({ ownerKey: null })` (borra colas `queue-*` y borradores ajenos sin tocar la sesión nueva) y quita la configuración; el dueño nuevo se fija al cargar el hogar.
- **«Tienes N gastos por enviar»:** usa `pendingToSendCount` del plugin cuando hay algo que atender en la bandeja (`unsentCount`); si no hay número del plugin, el cálculo local.
- **Borradores:** `possibleDuplicate` (del plugin; entre 45 s y 2 min; dentro de 45 s se descarta por diseño) y `sourcePackage` («Detectado desde <app>», con el nombre de `readRecentApps` si se conoce, si no el paquete).

## Guardado automático por banco y avisos de la pareja (fase 5)
**Diseñado por tipos: los contratos del backend aún no existen** en `nativeBridge.ts` ni en Supabase. Hay que confirmar los nombres cuando se documenten en `backend-android.md`.
- `lib/bankAuto.ts` define `BankAutoApi` (supuesto): `getBankPresets`, `setBankAutoSave({bankId, enabled})`, `setBankPackage({bankId, packageName|null})` (nombre inventado para asociar la app), `setAutoCap({maxClp})`, `getSyncState`. Si el plugin no los tiene, la sección muestra «Esta versión de la app todavía no incluye el guardado automático» en vez de tarjetas que no funcionan.
- Ajustes > Captura de gastos: una tarjeta por banco (Santander, Banco Estado, Banco Falabella, Banco de Chile) con «Guardar solos los gastos de <banco>», apagado por defecto, que explica que solo aplica a gastos bajo el tope, nunca a abonos, y que se puede deshacer. Muestra «Sin app asociada» o «App asociada: <paquete>»; asociar usa el modo aprender (`readRecentApps`). Sin app asociada el interruptor no se puede encender.
- Tope editable: campo en pesos (`MIN_CAP_CLP` 1.000 a `MAX_CAP_CLP` 5.000.000) que reemplaza al selector fijo; se guarda en la configuración y con `setAutoCap`. `captureConfig` ya no limita el tope a 4 opciones.
- `SyncStatus`: estado del envío y gastos por enviar, con «Enviar ahora».
- `PartnerAlerts` («Avisarme cuando mi pareja haga un gasto mayor», umbral por defecto 50.000, validado con `parseThreshold`). Usa `lib/partnerAlerts.ts` con un `PartnerAlertStore`; hoy es `unavailableStore` y la tarjeta dice que se activa con una próxima actualización. Cuando exista la tabla o RPC, basta reemplazar `partnerAlertStore`.
- Bandeja: sección «Guardados automáticamente» con la marca «Guardado automático» y Deshacer. Es solo de la sesión de la app (no persiste) y se alimenta de lo que guarda `useDetected` solo; los gastos que guarde el plugin en segundo plano necesitarán que el backend los exponga.

## Contratos reales del plugin conectados (fase 6)
- Los nombres de `getBankPresets`, `setBankAutoSave`, `setBankPackage`, `setAutoCap`, `getSyncState` y `syncNow` **coinciden** con `nativeBridge.ts` (el supuesto de la fase 5 era correcto). `getSyncState` devuelve `idle|error` y `parseSyncState` lo lee.
- **Perfil para guardar solo:** `useAutoSync` (en Shell) llama `configureSync({apiBase})` al arrancar (solo https; si no hay, `null` y no se envía nada en segundo plano), y `setActiveOwner` + `setAutoProfile(buildAutoProfile(...))` al iniciar sesión, al cambiar de hogar o cuenta, y cuando cambia el historial o la preferencia de compartido. `buildAutoProfile` usa `buildAutoCategories` solo con categorías que existen. Sin perfil del dueño activo el teléfono no guarda ni envía nada solo.
- **Guardados automáticamente:** la lista sale de `listAutoSaved` (validada con `parseAutoSaved`), con «Guardado automático», si ya está en la cuenta o solo en el teléfono, y Deshacer: `undoAutoSaved`; si `needsDelete`, la app borra el gasto con `deleteExpense` y luego llama `dismissAutoSaved`. Un error muestra un aviso con «Reintentar». Se eliminó la lista local de la sesión (`addAutoSaved`/`removeAutoSaved`).
- **Enviar ahora:** `sendNow` llama `syncNow()` del plugin y relee borradores.
- **Avisos de la pareja:** usa el `partnerAlertStore` real (tabla `big_spend_alert_prefs` + RPC `set_big_spend_alert`). Si la migración no está aplicada (42P01/PGRST205/42883/PGRST202) la tarjeta dice que falta una actualización del servicio y el resto de Ajustes sigue funcionando; un fallo al guardar ofrece «Reintentar».
- Pendiente de decisión: el modo automático «global» (interruptor de Ajustes) y los guardados por banco del teléfono conviven; no se comprobó que no se solapen en un teléfono real.

## Ronda 3: carrera al cambiar de cuenta (R3-03)

- `lib/nativeSerial.ts`: cola serial de las llamadas nativas que fijan o borran al dueño, con un número de generación. `enqueueNative` sale en el acto si la cola está libre y si no espera su turno; `emitNow` emite de inmediato (borrados) y lo encolado después espera su respuesta; `invalidateOwner` sube la generación.
- `useAutoSync`: `setActiveOwner` y luego `setAutoProfile` van en la cola, y el perfil solo se envía si no hubo borrado/cambio de cuenta ni cancelación del efecto entre ambas. `wipeSessionData` y `wipeForAccountSwitch` invalidan la generación. `useDetected.load` fija el dueño por la misma cola.
- No se requiere cambio de contrato. Defensa en el teléfono (R3-04/05) queda a cargo del backend.

## App Android sin rastro de PWA y actualizaciones nativas

- En nativo (`isNativeApp()`): `InstallBanner`, `InstallGuide` y el ítem «Cómo instalar» de Ajustes no se dibujan; `main.tsx` no arranca los vigilantes de instalación ni de service worker; `AccessCard` quita «App instalada» (`Conexión y avisos`); `SecurityInfo` y `securityChecks` omiten caché/service worker/instalada/almacenamiento del navegador; `needsFor(native)` quita «Instalarla»; Admin ya no dice «navegador». La web queda igual.
- `PushToggle` delega en `NativePushToggle` (permiso de Android + token FCM, sin Web Push/VAPID).
- «Acerca de» muestra «Aplicación Android», versión, número de compilación y estado de actualizaciones.
- Actualizaciones: `lib/appUpdate.ts` (lógica pura: 12 h, «Más tarde» por versión, errores en español simple, parsers), `lib/appUpdateStore.ts` (estado compartido), `NativeUpdateSheet` (hoja con barra `role="progressbar"`, Reintentar, guía a Ajustes si falta el permiso). Revisa 4 s tras abrir y con el botón manual (que ignora el límite y lo descartado).
- CONTRATO PENDIENTE (declarado por tipos en `nativeBridge.ts`, el backend debe confirmarlo): `getAppInfo`, `getPushStatus`, `enablePush`, `disablePush`, `checkForUpdate`, `downloadUpdate` (evento `updateProgress {downloaded,total?}`), `installUpdate` (code `NEEDS_INSTALL_PERMISSION`), `openInstallSettings`. Códigos de error: NETWORK, NO_SPACE, CORRUPT.

## Cómo probar
- `npm --prefix web test` (todo) o `npx --prefix web vitest run src/lib/toastQueue.test.ts src/components`.
- `npm --prefix web run lint` · `npm --prefix web exec -- tsc -b web` (desde la raíz).
- Prueba en teléfono (solo el dueño, requiere el APK): dar el acceso a notificaciones desde Ajustes > Captura de gastos, elegir el banco con «Buscar mis bancos», hacer un pago, revisar la bandeja, guardar y probar Deshacer; abrir `adb shell am start -a android.intent.action.VIEW -d "nido://gasto?monto=5990&comercio=Cafe"`; con avión activado guardar un gasto y ver que se envía al volver la red.
- Manual en el navegador (`npm --prefix web run dev`): `/?error=0|401|403|404|503|500` muestra cada pantalla de estado; `/?tab=zzz` muestra «No encontramos esa página»; Ajustes > Acerca de > «Ver licencias».
- NO VERIFICADO: render en teléfono real, botón atrás, barra de estado, teclado, splash, háptica y deslizar para actualizar (requieren la app nativa).
