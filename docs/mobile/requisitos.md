<!-- Copyright (c) 2026 Dinovance -->
# Requisitos: Contigo para Android (paridad total + captura desde notificaciones)

Estado: borrador v0.1 · Fecha: 2026-11-21 · Rama: `<rama de trabajo>` · Worktree: `<ruta local del worktree>`

Fuente: lectura de código del repo (sin ejecutar nada contra producción, sin red). Cada afirmación sobre el código cita su archivo. Lo que no se comprobó por ejecución va marcado **NO VERIFICADO**.

Marcas usadas en el inventario:
- **[W]** depende de una API solo-web (service worker, `Notification`, `PushManager`, `localStorage`, `matchMedia`, `beforeinstallprompt`, `navigator.onLine`, `navigator.clipboard`, descarga por `blob:`, script externo de Cloudflare/Google). Requiere adaptación nativa.
- **[S]** usa Supabase directamente (auth, realtime, RPC, `functions.invoke`, tablas).
- Sin marca: lógica o UI pura, sin API de navegador detectada con búsqueda por grep.

---

## 0. Decisiones previas y supuestos

| ID | Decisión | Por qué | Estado |
|----|----------|---------|--------|
| DEC-01 | **Cómo llega la app nativa a Supabase.** El cliente web nunca habla con Supabase directo: usa `/supabase` del mismo origen (`web/src/lib/supabase.ts`, `PROXY_PREFIX`), que en producción es un Worker (`web/worker/proxy.ts`, `web/wrangler.jsonc`) y en desarrollo el proxy de Vite (`web/vite.config.ts`). En una WebView de Capacitor no existe ese origen. | Hay que elegir entre (A) URL del proyecto y clave publicable inyectadas en el build nativo desde configuración local, sin commitearlas, o (B) seguir pasando por el Worker. (A) pierde el límite por IP del Worker (`RL_AUTH`, `RL_WRITE` en `wrangler.jsonc`); (B) mantiene esa protección. | **NO VERIFICADO**: decisión pendiente. Recomendación: (B) mientras el Worker siga siendo la capa de límites. |
| DEC-02 | **Inicio de sesión con Google en nativo.** Hoy `web/src/lib/oauth.ts` hace `signInWithOAuth` por redirección (PKCE, `detectSessionInUrl: false`). Una redirección dentro de WebView no es una opción fiable. | Google restringe OAuth en navegadores embebidos (**NO VERIFICADO** contra la política vigente). La vía de token de identidad ya existe: `web/src/lib/google.ts` → `signInWithGoogleToken(token, nonce)` con `signInWithIdToken`. | Propuesta: Google Sign-In nativo que entregue `idToken` + `nonce` al mismo `signInWithGoogleToken`. |
| DEC-03 | **Almacenamiento de la sesión.** `web/src/lib/supabase.ts` usa `storageKey: 'contigo-auth'` (localStorage). `web/src/lib/oauth.ts` usa un segundo cliente con `storageKey: OAUTH_KEY`. | localStorage de una WebView no está cifrado ni protegido por hardware. | Requisito RF-19 / NFR-01. |
| DEC-04 | **Push nativo.** Hoy: `web/src/lib/push.ts` usa `PushManager` + VAPID y guarda en `push_subscriptions` (`supabase/migrations/20261018024931_push.sql`: columnas `endpoint`, `p256dh`, `auth_key`). El envío lo hace `supabase/functions/notify/index.ts` con la librería `web-push`. | FCM no usa esas columnas. Hace falta un token FCM por dispositivo y un emisor FCM. Cambios de esquema = migración nueva (AGENTS.md). | Requisito RF-10. Sin aplicar ni desplegar nada desde este agente. |
| DEC-05 | **Captura desde notificaciones.** Requiere que la persona conceda acceso a notificaciones en Ajustes del sistema (`NotificationListenerService`). | Es el único camino en Android para leer notificaciones de otras apps. Puede tener restricciones en la tienda de aplicaciones. | **NO VERIFICADO**: revisar políticas vigentes de Google Play antes de comprometer el alcance. |
| SUP-01 | Plataforma objetivo Android: `minSdk 26`, `targetSdk 36` (`web/android/variables.gradle:3-5`). | Depende de Capacitor 8 y de los plugins que se elijan. | Fijado en el repo; compatibilidad de los plugins en dispositivo NO VERIFICADO. |
| SUP-02 | Los textos de la app siguen en español simple, sin jerga financiera (AGENTS.md, «Reglas»). | Regla del proyecto. | Vigente. |
| SUP-03 | Todo se prueba en local (AGENTS.md, «REGLA DE ORO»). Ningún agente despliega, hace `git push` ni toca el Supabase real. | Regla del proyecto. | Vigente. |

---

## 1. Inventario de paridad

Cada línea: qué existe, dónde está, y si depende de algo solo-web.

### 1.1 Navegación y arranque

- **Pestañas principales** (Inicio, Gastos, Registrar, Finanzas, Metas): `web/src/Shell.tsx` (`TABS`, líneas 31-37). Navegación por estado + `?tab=` en la URL. **[W]** (`location.search`, `history.replaceState`, `document.title`).
- **Pestañas secundarias** (Ajustes `security`, Ayuda `help`, Perfil `profile`): `web/src/Shell.tsx` (tipo `Tab`, línea 40). **[W]** en la parte de URL.
- **Barra inferior** `nav.tabbar`: `web/src/Shell.tsx` (líneas 236-256). Requiere área segura inferior.
- **Atajos de la app instalada** (`?tab=add`, `?tab=expenses`, `?tab=goals`): `web/vite.config.ts` (`manifest.shortcuts`, líneas 111-113). **[W]** (manifiesto PWA). Equivalente nativo: atajos de launcher (**NO VERIFICADO** si el plugin elegido los soporta).
- **Compartir texto hacia Contigo** (`share_target`, GET con `title`/`text`): `web/vite.config.ts` línea 109. Lectura en `web/src/lib/bankNotice.ts` → `readSharedNotice`. **[W]** (manifiesto). Nativo: filtro de intención `ACTION_SEND` (ver RF-20).
- **Texto por automatización** (`#text=`, dirección con hash que no sale del teléfono): `web/src/lib/bankNotice.ts` → `readSharedNotice(search, hash)`. **[W]** (URL). Nativo: enlace profundo (ver RF-27).
- **Arranque y decisión de pantalla** (sesión, MFA, reset, hogar): `web/src/App.tsx` (`App`, línea 72; `onAuthStateChange` línea 82; `getSession` línea 94). **[S]**.
- **Pantalla de carga a pantalla completa**: `web/src/components/ScreenLoader.tsx`; `web/src/components/ActivityLoader.tsx` (espera antes de mostrar). Usa `navigator.onLine` [W] en el segundo.
- **Pantalla de error por código HTTP**: `web/src/components/ErrorPage.tsx`, `web/src/lib/httpErrors.ts` (`errorInfo`, `wantsHtml`). `wantsHtml` mira cabeceras de respuesta: **[W]** conceptualmente (NO VERIFICADO si aplica en nativo).
- **Límite de errores de render**: `web/src/components/ErrorBoundary.tsx`. Sin API solo-web.
- **Actualización de versión** (service worker): `web/src/lib/update.ts` (`registerSW` de `virtual:pwa-register`, `startUpdateWatcher`, `applyUpdate`, `useUpdateWaiting`) y `web/src/components/UpdateBanner.tsx`. **[W]** completo. Ver RF-24.
- **Foco al cambiar de pantalla** (accesibilidad): `web/src/lib/a11y.ts` (`focusMain`). Sin API solo-web; reintenta hasta que la pantalla diferida exista.
- **Pantallas diferidas** (`lazy`): `web/src/Shell.tsx` líneas 18-28 y precarga de líneas 44-47. Sin API solo-web. Relevante para arranque rápido (RF-17).

### 1.2 Pantallas (`web/src/screens`)

- **Entrada / inicio de sesión** (correo y contraseña, Google, crear cuenta, olvidé contraseña): `web/src/screens/AuthScreen.tsx` (`AuthScreen`). **[S]** (`signInWithPassword`, `signUp`, `resetPasswordForEmail`) y **[W]** (`redirectTo`, captcha, instalación).
- **Crear cuenta / registro**: `web/src/screens/Register.tsx` NO es el registro de cuenta; es la pantalla **Registrar** (ver abajo). El registro de cuenta está en `AuthScreen.tsx` (`signUp`, línea 88) y `web/src/lib/register.ts` (`Draft`, `initialDraft`). **[S]**.
- **Restablecer contraseña desde el enlace del correo**: `web/src/screens/ResetPassword.tsx` (`ResetPassword`, `listFactors`, `updateUser`). **[S]**. El enlace se procesa en `web/src/lib/recovery.ts` (`consumeRecoveryLink`, lee `window.location.href` y llama `exchangeCodeForSession`). **[W]**.
- **Crear contraseña (cuentas con Google)**: `web/src/screens/SetupPassword.tsx` (`SetupPassword`) y `web/src/components/CreatePassword.tsx`. **[S]**.
- **Verificación en dos pasos al entrar (TOTP)**: `web/src/screens/MfaChallenge.tsx` (`MfaChallenge`, `mfa.listFactors`, `challenge`/`verify`). **[S]**. Lógica de cuándo exigirlo: `web/src/lib/mfa.ts` (`needsMfaChallenge`, `useMfaGate`). **[S]**.
- **Crear hogar (onboarding)**: `web/src/screens/Onboarding.tsx` (`Onboarding`, RPC `create_household`). **[S]**.
- **Inicio** (saludo, mes, anillo de categorías, Venn de aportes, gráficos, resumen): `web/src/screens/Home.tsx` (`Home`). Usa `HomeCharts`, `Ring`, `Venn`, `SavingsCheck`, `Modal`. **Sin API solo-web directa**; sus gráficos dependen de SVG/CSS (NO VERIFICADO en WebView de tamaño variable).
- **Gastos** (listado por día, filtros por ámbito, borrado): `web/src/screens/Expenses.tsx` (`Expenses`). Borra directo con `supabase.from('expenses').delete()` (línea 204). **[S]**.
- **Finanzas** (sueldo, ingresos extra, deudas, simulador, análisis, gastos fijos): `web/src/screens/Money.tsx` (`Money`, 1.210 líneas). Usa `AnalysisPanel`, `IncomesCard`, `RecurringPanel`, `SalaryCalculator`, `SavingsCheck`. **[S]** (`supabase` en línea 781).
- **Metas** (crear meta, aportar, progreso): `web/src/screens/Goals.tsx` (`Goals`). Llama `notifyPartner('contribution', ...)` (línea 73). **[S]** y **[W]** (push).
- **Registrar** (gasto, aporte, gasto fijo, meta, deuda; pegar aviso del banco; categoría nueva): `web/src/screens/Register.tsx` (`Register`). **[W]** en `pasteNotice` (`navigator.clipboard.readText`, línea 162). **[S]** en guardado. Llama `notifyPartner` (líneas 238, 262). Usa `newId()` para idempotencia (líneas 136, 217, 239, 263).
- **Ajustes** (cuenta, seguridad, aplicación, tus datos, información): `web/src/screens/Security.tsx` (`Security`). Agrupa tarjetas (ver 1.3). **[W]** por sus tarjetas.
- **Mi perfil** (profesión, fecha de nacimiento, sueldo, privacidad con la pareja): `web/src/screens/Profile.tsx` (`Profile`). **[S]**.
- **Ayuda** (guía por sección, consejos): `web/src/screens/Help.tsx` (`Help`) y contenido en `web/src/lib/help.ts` (`HELP_GROUPS`). Sin API solo-web.
- **Panel de administración** (solo administrador: estadísticas, hogares, verificación en dos pasos): `web/src/screens/Admin.tsx` (`Admin`, 619 líneas). **[S]** (`admin_*` RPC, `mfa`). Ver `web/src/lib/admin.ts`.
- **Shell de pantalla vacío**: `web/src/screens/Shell.tsx` tiene **0 bytes**. No es funcionalidad; es un fichero residual. Verificado con `ls -la`. Acción sugerida: eliminarlo en la rama nativa (no se toca en esta tarea).

### 1.3 Componentes (`web/src/components`)

Una línea por componente. La marca [W] indica API solo-web; [S] indica uso directo de Supabase.

- `AboutCard.tsx`: «Acerca de» con versión y derechos. **[W]** (`lib/about.ts`: `navigator.serviceWorker`, `location.reload`).
- `AccessCard.tsx`: estado de internet, instalación y avisos en Ajustes. **[W]** (`navigator.onLine`; `matchMedia`; `Notification`).
- `ActivityLoader.tsx`: retraso antes de mostrar el cargador. **[W]** (`navigator.onLine`).
- `AnalysisPanel.tsx`: análisis personal del mes. Sin API solo-web; usa `lib/useAnalysisBuild.ts`.
- `Avatar.tsx`: inicial o silueta por persona. Sin API solo-web.
- `BackupCard.tsx`: descarga de copia del hogar. **[W]** descarga por `URL.createObjectURL` + `<a download>` (`lib/backup.ts`, líneas 95-98). Nativo: compartir/guardar archivo (RF-23).
- `BankRates.tsx`: bloque desplegable con tasas bancarias. Sin API solo-web.
- `Charts.tsx`: anillo (`Donut`) y barras (`Bars`). Sin API solo-web.
- `Collapsibles.tsx`: aplana fragmentos para la guía de pantalla. Sin API solo-web.
- `CreatePassword.tsx`: crear contraseña para cuentas Google. **[S]**.
- `DebtGuidedForm.tsx`: alta de deuda por pasos. **[S]** (guardado).
- `DebtSimulator.tsx`: interés total y efecto de pagar más cada mes. Sin API solo-web.
- `DeleteAccountInline.tsx`: borrar cuenta sin hogar. **[S]** (`auth.signOut`).
- `EmailCard.tsx`: cambio de correo con confirmación. **[S]** (`auth.updateUser`).
- `ErrorBoundary.tsx`: captura errores de render. Sin API solo-web.
- `ErrorPage.tsx`: pantalla de error por código. Sin API solo-web.
- `FinancialProfile.tsx`: perfil financiero y pasos para subir de nivel. Sin API solo-web.
- `FindingList.tsx`: lista de conclusiones con negrita. Sin API solo-web.
- `GoalCreateForm.tsx`: alta de meta. **[S]**.
- `GoogleButton.tsx`: botón de Google (Identity Services). **[W]** carga `https://accounts.google.com/gsi/client` (`lib/google.ts`, línea 50). Nativo: reemplazar por Google Sign-In nativo (DEC-02).
- `HomeCard.tsx`: hogar, miembros e invitación. **[W]** `navigator.clipboard.writeText` (línea 18). **[S]**.
- `HomeCharts.tsx`: gráficos del Inicio (`MonthCurveCard`, `SixMonthsCard`). Sin API solo-web.
- `Icon.tsx`: íconos SVG. Sin API solo-web.
- `IncomesCard.tsx`: ingresos extra privados del mes. **[S]**.
- `InstallBanner.tsx`: aviso flotante para instalar la PWA (`beforeinstallprompt`). **[W]** Solo aplica a la web; en nativo se elimina.
- `InstallGuide.tsx`: pasos para instalar según dispositivo (iOS, Android). **[W]**. Solo web; en nativo se elimina.
- `Intro.tsx`: índice para controlar la guía de Ayuda desde fuera. Sin API solo-web.
- `LeaveAccount.tsx`: salir del hogar o borrar cuenta, con contraseña. **[S]**.
- `LegalModal.tsx`: políticas y términos sin iniciar sesión. Sin API solo-web (NO VERIFICADO el contenido en WebView).
- `LockScreen.tsx`: pantalla de bloqueo con contraseña y límite de intentos. **[W]** (`createThrottle` con `localStorage`, `lib/security.ts`; `supabase.auth.signOut`).
- `LockSettings.tsx`: minutos de bloqueo por inactividad. **[W]** (`lib/applock.ts`, localStorage).
- `LogoLoader.tsx`: cargador con el logo. Sin API solo-web.
- `Logo.tsx`: logo. Sin API solo-web.
- `MfaCard.tsx`: activar o desactivar verificación en dos pasos. **[S]**.
- `Modal.tsx`: ventana superpuesta. Sin API solo-web (requiere gestión del botón atrás en Android: RF-11).
- `OfflineBar.tsx`: franja «Sin conexión». **[W]** (`navigator.onLine`, eventos `online`/`offline`). Su texto afirma que los cambios no se guardan sin conexión: hoy es cierto (ver 2.4).
- `PartnerPrivacyCard.tsx`: qué ve la pareja. **[S]** (`members`).
- `PasswordCard.tsx`: cambiar contraseña y cerrar otras sesiones. **[S]**.
- `ProfileCard.tsx`: fecha de nacimiento (límite de 18 años). **[S]** en guardado.
- `PushToggle.tsx`: interruptores de avisos. **[W]** (`Notification.requestPermission`, `lib/push.ts`). **[S]** (`functions.invoke('notify')`).
- `RecurringCreateForm.tsx`: alta de gasto fijo con plantillas. **[S]** (`rpc('apply_recurring')` en línea 81).
- `RecurringPanel.tsx`: gastos fijos del mes. **[S]** (`rpc('apply_recurring')` en línea 64).
- `Ring.tsx`: anillo de progreso. Sin API solo-web.
- `SalaryCalculator.tsx`: sueldo bruto a líquido (Chile). Sin API solo-web; cálculo en `lib/chile.ts`.
- `SavingsCheck.tsx`: aviso para ahorrar. **[W]** (`lib/savingsAnswer.ts`, `localStorage`).
- `ScopeBar.tsx`: ámbito «hogar / yo / pareja». Sin API solo-web; lógica en `lib/scope.ts`.
- `screenGuides.tsx`: guía por pantalla (`SCREEN_GUIDES`). Sin API solo-web.
- `ScreenHelp.tsx`: botón de ayuda del encabezado que abre la guía corta de la sección. Sin API solo-web detectada.
- `ScreenLoader.tsx`: cargador a pantalla completa con fondo borroso. Sin API solo-web.
- `SectionHead.tsx`: encabezado de grupo de tarjetas. Sin API solo-web.
- `SecurityInfo.tsx`: comprobaciones en vivo de seguridad. **[W]** (`lib/securityChecks.ts`: `matchMedia('(display-mode…)')`, `navigator.storage.persisted`, `navigator.serviceWorker`).
- `SettingsItem.tsx`: fila de ajuste con resumen. Sin API solo-web.
- `Spin.tsx`: rueda de carga con texto. Sin API solo-web.
- `ThemeToggle.tsx`: claro / oscuro / sistema. **[W]** (`lib/theme.ts`: `localStorage`, `matchMedia('prefers-color-scheme')`).
- `Toast.tsx`: avisos emergentes. Sin API solo-web.
- `tourSlides.tsx`: diapositivas de bienvenida (`WELCOME_SLIDES`). Sin API solo-web.
- `Tour.tsx`: guía por sección. Sin API solo-web detectada. La marca de «ya vista» (`lib/tour.ts`, `localStorage`) la usan `Shell.tsx` y `screens/Help.tsx`, no este componente.
- `UpcomingCard.tsx`: próximos 30 días (pagos, sueldo). Sin API solo-web; lógica en `lib/upcoming.ts`.
- `UpdateBanner.tsx`: aviso de versión nueva. **[W]** (`lib/update.ts`, service worker).
- `Venn.tsx`: dos círculos de aporte compartido. Sin API solo-web.

### 1.4 Módulos de lógica (`web/src/lib`)

Hay 43 ficheros de test entre `web/src` y `web/worker` (`find`, verificado). Cada `*.ts` sin test propio se marca con «sin test».

Módulos de la captura (prioritarios):

- `bankNotice.ts`: `parseBankNotice(text, now)` saca monto CLP, comercio, fecha, y distingue gasto (`kind: 'expense'`) de abono (`kind: 'income'`); `readSharedNotice(search, hash)` lee texto compartido. Pura, sin API solo-web. 19 tests (`bankNotice.test.ts`). Usada por `web/src/lib/register.ts` (línea 53) y por `readNotice` en `web/src/screens/Register.tsx` (línea 141). **Reutilizable como especificación para el parser Kotlin** (RF-02).
- `categorize.ts`: `suggestCategory(note, categories, history)` aprende de lo que la persona ya eligió para ese comercio (paso 1 y 2), luego usa una lista fija de comercios chilenos (`KNOWN`, paso 3); `suggestShared(categoryId, history)` sugiere compartido o personal. Pura, sin API solo-web. 15 tests (`categorize.test.ts`). **Ya aprende comercio→categoría** a partir del historial de gastos con `note`: no hay tabla de reglas aparte. Reutilizar tal cual en TS; el aprendizaje nativo necesita el historial en local (RF-08).
- `applock.ts`: `getLockMinutes`, `setLockMinutes`, `touch`, `shouldLock`, `lastActive`, `isFlaggedLocked`. **[W]** (`localStorage`, claves `contigo-lock-min`, `contigo-last-active`, `contigo-locked`). Lógica pura de tiempo reutilizable; 3 tests (`applock.test.ts`).
- `useAppLock.ts`: decide si la app está bloqueada; escucha `visibilitychange` y `storage`. **[W]**.
- `push.ts`: `pushSupported`, `currentPushState`, `enablePush`, `disablePush`, `notifyPartner(kind, id)`, `sendTest`. **[W]** (service worker, `PushManager`, `Notification`) y **[S]** (`push_subscriptions`, `functions.invoke('notify')`). Sin tests (NO VERIFICADO).
- `data.ts`: `useData(householdId, userId, year, monthIndex)`. Carga gastos, ingresos, categorías, metas, deudas, perfiles, recurrentes. **[S]** (tablas y `supabase.rpc('apply_recurring')`); realtime por canales privados `hh:<hogar>` y `u:<usuario>` con `supabase.channel(..., { config: { private: true } })` (líneas 255-265); **[W]** `visibilitychange` (líneas 222-225, 268-281). Sin tests (NO VERIFICADO).
- `account.ts`: `hasPassword`, `usesGoogle`, `useAccount`. **[S]** (`auth.getUser`, `onAuthStateChange`). 7 tests.
- `supabase.ts`: cliente único con `storageKey: 'contigo-auth'`, `detectSessionInUrl: false`, `global.fetch: trackedFetch`. **[W]** (`globalThis.location`) y **[S]**. Ver DEC-01 y DEC-03.
- `oauth.ts`: segundo cliente PKCE para Google por redirección (`flowType: 'pkce'`, `storageKey: OAUTH_KEY`). **[W]** (`localStorage`, `window.location`). Ver DEC-02.
- `google.ts`: `loadGsi` (script de Google), `signInWithGoogleToken` (`signInWithIdToken`), `markTermsAccepted` (`updateUser`), nonce con `crypto.subtle.digest`. **[W]** (script externo) y **[S]**. El flujo de token es reutilizable (DEC-02).
- `recovery.ts`: `consumeRecoveryLink` procesa el enlace de recuperación desde la dirección. **[W]** (`window.location`) y **[S]** (`exchangeCodeForSession`).
- `idempotency.ts`: `newId()` (UUID v4 generado en el cliente, con respaldo para navegadores antiguos) e `isAlreadySaved` (código `23505` sobre `_pkey`). Sin API solo-web (usa `crypto.randomUUID`, disponible en WebView moderna; NO VERIFICADO en la WebView mínima elegida). 10 tests. **Base del identificador de la cola sin conexión** (RF-18).
- `trackedFetch.ts`: `fetch` con tiempo máximo, reintento para lecturas (`READ`: 1 reintento, 20 s) y sin reintento para escrituras (`WRITE`: 0, 30 s); espera a `online` hasta 20 s. **[W]** (`navigator.onLine`, evento `online`). Sin test propio (NO VERIFICADO).
- `resilience.ts`: `withResilience`, `backoffDelay`, `isIdempotentMethod`, `TimeoutError`. Sin API solo-web.
- `smartNotify.ts`: avisos inteligentes locales: no molestar de 22:00 a 08:00 (`QUIET_FROM`/`QUIET_TO`), máximo 1 por día (`DAILY_CAP`), recordatorio de avisos urgentes cada 3 días (`RENOTIFY_BAD_MS`). **[W]** (`Notification`, `navigator.serviceWorker.ready.showNotification`, `localStorage` en `contigo-seen-alerts`, `contigo-notify-log`, `contigo-smart-notify`). Sin test propio (NO VERIFICADO). Ver RF-25.
- `alertState.ts`: avisos pospuestos o descartados (`snoozeAlert`). **[W]** (`localStorage`).
- `savingsAnswer.ts`: recuerda el «no ahorro» por mes. **[W]** (`localStorage`).
- `tour.ts`: marca de guía vista. **[W]** (`localStorage`).
- `theme.ts`: `getThemePref`, `applyTheme`. **[W]** (`localStorage`, `matchMedia`).
- `wipe.ts`: `wipeSessionData` borra claves `contigo-*` del dispositivo al cerrar sesión, excepto las de `KEEP` y `contigo-auth`. **[W]** (`localStorage`, `sessionStorage`). Ver RF-19 (la sesión debe borrarse del almacén seguro).
- `security.ts`: `passwordStrength`, `createThrottle` (límite de intentos guardado en `localStorage`). **[W]** solo en `createThrottle`.
- `securityChecks.ts`: comprobaciones de seguridad (`display-mode`, `navigator.storage.persisted`, `serviceWorker`). **[W]**.
- `install.ts`: `isStandalone`, `isIos`, `beforeinstallprompt`. **[W]**. Solo web: se elimina en nativo.
- `about.ts`: datos de «Acerca de» y estado del service worker. **[W]**.
- `storage.ts`: `fillForecast` (cuánto tardaría en llenarse la base). Sin API solo-web.
- `backup.ts`: arma el respaldo JSON del hogar (`readAll`). **[S]** y **[W]** en la descarga (`createObjectURL`, líneas 95-98).
- `register.ts`: borrador de «Registrar» (`Draft`, `initialDraft`, `readNotice`). Usa `parseBankNotice` y `suggestCategory`. Sin API solo-web.
- `expenseAnalysis.ts`, `analysis.ts`, `numbers.ts`, `homeSummary.ts`, `homeCharts.ts`, `smartAlerts.ts`, `engine.ts`, `fixedInsights.ts`, `upcoming.ts`, `financialProfile.ts`, `profile.ts`, `debtAnalysis.ts`, `finance.ts`, `advisor.ts`, `bankRates.ts`, `bankData.ts`, `chile.ts`, `goals.ts`, `metrics.ts`, `split.ts`, `scope.ts`, `moves.ts`, `history.ts`, `paging.ts`, `calendar.ts`, `format.ts`, `ui.ts`, `needs.ts`, `birth.ts`, `legal.ts`, `chartColors.ts`, `plain.ts`, `rich.tsx`, `a11y.ts`, `httpErrors.ts`, `activity.ts`, `admin.ts`, `captcha.ts`, `mfa.ts`, `reauth.ts`, `useAnalysisBuild.ts`, `useDesktop.ts`, `useToastError.ts`, `update.ts`: lógica de cálculo y de datos. Sin API solo-web salvo las marcadas abajo.
  - `captcha.ts`: carga `https://challenges.cloudflare.com/turnstile/v0/api.js` (línea 22). **[W]**. Riesgo en WebView: ver RIESGO-17.
  - `useDesktop.ts`: `matchMedia` para el menú lateral en escritorio. **[W]** (irrelevante en Android; se fija a móvil).
  - `history.ts`: `fetchHistory`, `fetchExpenseRows`. **[S]**. Es el historial que alimenta `categorize.ts`.
  - `paging.ts`: `fetchAllPages`: el servidor corta en 1.000 filas. **[S]**.
  - `activity.ts`: indicador de actividad con el servidor. Sin API solo-web.
  - `admin.ts`: `fetchAdminStats`, RPC `admin_*`. **[S]**.
  - `mfa.ts`: `needsMfaChallenge`, `useMfaGate`. **[S]**.
  - `reauth.ts`: `confirmPassword` (`signInWithPassword`). **[S]**.
  - `database.types.ts`: tipos generados de Supabase. Sin API solo-web.
  - `legal.ts`: versión de los textos legales. Sin API solo-web.
  - `rich.tsx`: texto con énfasis sin HTML. Sin API solo-web.
  - `plain.ts`: quita marcas de negrita. Sin API solo-web.
  - `useToastError.ts`, `Toast`: avisos de error. Sin API solo-web.

Sin test propio (verificado por nombres de fichero): `push.ts`, `data.ts`, `smartNotify.ts`, `trackedFetch.ts`, `alertState.ts`, `install.ts`, `theme.ts`, `savingsAnswer.ts`, `tour.ts`, `wipe.ts`, `security.ts` (solo `createThrottle` y `passwordStrength`: NO VERIFICADO), `oauth.ts`, `recovery.ts`, `google.ts` (existe `google.test.ts`: NO VERIFICADO el alcance), `backup.ts` (tiene `backup.test.ts`).

### 1.5 Mapa de dependencias solo-web (resumen)

| API solo-web | Dónde se usa (archivos) | Adaptación nativa |
|---|---|---|
| Service worker, `registerSW`, `virtual:pwa-register` | `lib/update.ts`, `lib/about.ts`, `lib/securityChecks.ts`, `lib/smartNotify.ts`, `components/UpdateBanner.tsx`, `components/AboutCard.tsx` | Eliminar. Actualizaciones por tienda (RF-24). |
| `Notification`, `PushManager`, VAPID | `lib/push.ts`, `components/PushToggle.tsx`, `lib/smartNotify.ts`, `supabase/functions/notify/index.ts` | FCM (RF-10) y notificaciones locales (RF-25). |
| `localStorage` / `sessionStorage` | `lib/applock.ts`, `lib/security.ts`, `lib/theme.ts`, `lib/tour.ts`, `lib/savingsAnswer.ts`, `lib/alertState.ts`, `lib/smartNotify.ts`, `lib/oauth.ts`, `lib/install.ts`, `lib/wipe.ts`, `lib/supabase.ts` (sesión) | Preferencias en almacenamiento nativo; sesión y cola en almacenamiento seguro (NFR-01). |
| `matchMedia` (display-mode, prefers-color-scheme, escritorio) | `lib/install.ts`, `lib/securityChecks.ts`, `lib/theme.ts`, `lib/useDesktop.ts` | Modo oscuro del sistema vía CSS y plugin de barra de estado (RF-14). |
| `beforeinstallprompt`, pantallas de instalación | `lib/install.ts`, `components/InstallBanner.tsx`, `components/InstallGuide.tsx`, `components/AccessCard.tsx` | Eliminar en nativo. |
| `navigator.onLine` y eventos `online`/`offline` | `components/OfflineBar.tsx`, `components/AccessCard.tsx`, `components/ActivityLoader.tsx`, `lib/trackedFetch.ts` | Plugin de red de Capacitor (NO VERIFICADO el nombre exacto). |
| `navigator.clipboard` | `screens/Register.tsx` (`readText`), `components/HomeCard.tsx` (`writeText`) | Plugin de portapapeles de Capacitor (NO VERIFICADO el nombre exacto). |
| Descarga `blob:` + `<a download>` | `lib/backup.ts` | Compartir o guardar archivo (RF-23). |
| `window.location` / `?tab=` / `#text=` | `Shell.tsx`, `lib/bankNotice.ts`, `lib/recovery.ts`, `lib/oauth.ts`, `lib/supabase.ts` | Enlaces profundos y navegación nativa (RF-11, RF-22, RF-27). |
| Script externo de Google (GIS) | `lib/google.ts`, `components/GoogleButton.tsx` | Google Sign-In nativo (DEC-02). |
| Script de Cloudflare Turnstile | `lib/captcha.ts` | Ver RIESGO-17. |
| `visibilitychange` | `lib/data.ts`, `lib/useAppLock.ts` | Ciclo de vida de la app (`appStateChange`) (RF-17, RF-16). |
| `crypto.subtle`, `crypto.randomUUID` | `lib/google.ts`, `lib/idempotency.ts` | Disponibles en WebView moderna (NO VERIFICADO en la versión mínima). |

### 1.6 Uso de Supabase desde el cliente

- **Auth**: `signInWithPassword` (`screens/AuthScreen.tsx` línea 76, `lib/reauth.ts`), `signUp` (`AuthScreen.tsx` línea 88), `resetPasswordForEmail` (`AuthScreen.tsx` línea 61), `signOut` (varios), `getSession`/`onAuthStateChange` (`App.tsx`, `lib/account.ts`), `updateUser` (`lib/google.ts`, `components/PasswordCard.tsx`, `components/EmailCard.tsx`), `exchangeCodeForSession` (`lib/recovery.ts`, `lib/oauth.ts`), `signInWithIdToken` (`lib/google.ts`), `mfa.*` (`lib/mfa.ts`, `screens/MfaChallenge.tsx`, `components/MfaCard.tsx`, `screens/Admin.tsx`).
- **Realtime**: canales privados `hh:<hogar>` y `u:<usuario>` en `lib/data.ts` (líneas 255-286). Se suscribe con `supabase.realtime.setAuth()` antes de `subscribe()` (línea 264). Solo avisa qué tabla cambió y el hook recarga el grupo afectado (`GROUPS_OF`, líneas 56-69).
- **RPC**: `create_household` (`screens/Onboarding.tsx`), `apply_recurring` (`lib/data.ts` línea 218, `components/RecurringPanel.tsx`, `components/RecurringCreateForm.tsx`), `admin_*` (`lib/admin.ts`).
- **Edge Function**: `notify` con `kind` `expense`, `contribution` o `test` (`lib/push.ts` líneas 59 y 63).
- **Escritura directa de tablas**: `expenses` (borrado en `screens/Expenses.tsx` línea 204), `push_subscriptions` (`lib/push.ts`), y el resto de guardados en `Register.tsx`, `Goals.tsx`, `Money.tsx`, etc.

---

## 2. Requisitos funcionales nuevos

Formato: cada requisito tiene ID, descripción, reutilización del código existente y criterios de aceptación en forma **Dado / Cuando / Entonces**, pensados para convertirse en tests. «Fixture F##» remite a la sección 3.

### 2.1 Captura de gastos desde notificaciones (a–i)

**RF-01 Lista blanca de apps de origen.**
- Descripción: solo se leen las notificaciones de paquetes que estén en una lista blanca configurada por la persona. La lista inicial está vacía; la persona agrega las apps de su banco desde Ajustes. El filtro se aplica por nombre de paquete antes de leer cualquier texto.
- Reutiliza: nada existente (requisito nuevo).
- Criterios:
  - CA-01-1. Dado una notificación de un paquete que no está en la lista, Cuando el servicio la recibe, Entonces no lee `extras` y no la guarda (verificable: el parser no se invoca; el mock de cola no recibe nada). Fixture F27.
  - CA-01-2. Dado un paquete en la lista, Cuando llega una notificación, Entonces se pasa al parser.
  - CA-01-3. Dado que la persona quita un paquete de la lista, Cuando llega una notificación de él, Entonces se descarta.
  - CA-01-4. Dado que la lista está vacía, Cuando llega cualquier notificación, Entonces no se captura nada y la función de captura queda inactiva.

**RF-02 Parser de aviso: monto CLP, comercio, tipo, fecha.**
- Descripción: extrae de un texto de aviso el monto en pesos, el comercio, la fecha si existe, y clasifica en gasto, abono, retiro o no-movimiento. Debe comportarse igual que el parser TypeScript y compartir los mismos fixtures.
- Reutiliza: `web/src/lib/bankNotice.ts` (`parseBankNotice`). Se define como especificación: el mismo conjunto de fixtures se ejecuta en Kotlin (JVM) y en TypeScript.
- Criterios:
  - CA-02-1. Dado el fixture F01 («$12.990» con comercio), Cuando se parsea, Entonces `kind = expense`, `amount = 12990`, `merchant = "Almacen Demo Spa"`, `date = 2026-11-14`.
  - CA-02-2. Dado F02 (CLP sin puntos), Cuando se parsea, Entonces `amount = 4500`.
  - CA-02-3. Dado F15 (`$1.234,50`), Cuando se parsea, Entonces `amount = 1234` (centavos ignorados).
  - CA-02-4. Dado F16 (`$1.250.000`), Cuando se parsea, Entonces `amount = 1250000`.
  - CA-02-5. Dado F06 o F07 (abono o transferencia recibida), Cuando se parsea, Entonces `kind = income` y no se propone gasto.
  - CA-02-6. Dado F04 (compra en cuotas), Cuando se parsea, Entonces se registra la cuota (`amount = 15000`) con nota `cuota 1 de 3`. Es una decisión de producto, ver RIESGO-04.
  - CA-02-7. Dado F25 (retiro en cajero), Cuando se parsea, Entonces `kind = withdrawal` (requiere confirmación siempre, nunca automático).
  - CA-02-8. Dado cualquier fixture de la sección 3 con `resultado esperado = descartar`, Cuando se parsea o se filtra, Entonces no produce gasto.
  - CA-02-9. Dado el mismo texto en Kotlin y en TypeScript, Cuando se ejecutan ambos, Entonces el resultado es idéntico (prueba de paridad, ver sección 4).

**RF-03 Descartar OTP, promociones, claves y avisos sin movimiento.**
- Descripción: antes de extraer un monto, se descarta todo aviso que contenga palabras de seguridad o promoción, o que sea un saldo o una compra rechazada. No se guarda ni se muestra.
- Reutiliza: `bankNotice.ts` solo descarta moneda extranjera y montos cero. Esta regla es **nueva** y debe agregarse a ambos parsers.
- Criterios:
  - CA-03-1. Dado F10 (clave dinámica sin monto), Cuando se procesa, Entonces se descarta.
  - CA-03-2. Dado F11 (clave con un monto de $35.000), Cuando se procesa, Entonces se descarta por la palabra «clave» o «código», aunque haya un monto.
  - CA-03-3. Dado F12 o F13 (promoción), Cuando se procesa, Entonces se descarta.
  - CA-03-4. Dado F22 (saldo disponible), Cuando se procesa, Entonces se descarta.
  - CA-03-5. Dado F29 (compra rechazada), Cuando se procesa, Entonces se descarta.
  - CA-03-6. Dado F14 (compra en dólares), Cuando se procesa, Entonces se descarta (la app solo registra pesos).

**RF-04 Deduplicación.**
- Descripción: un mismo cargo puede llegar varias veces (reintento del banco, notificación actualizada, o dos notificaciones con el mismo texto). Se identifica por una huella (paquete + texto normalizado + monto + fecha) dentro de una ventana de 2 minutos. Además se respeta la clave `StatusBarNotification.key` cuando el sistema la repite.
- Reutiliza: `lib/idempotency.ts` para el identificador del registro (ver RF-18). La huella es nueva.
- Criterios:
  - CA-04-1. Dado F30 llega dos veces en menos de 2 minutos, Cuando se procesa la segunda, Entonces no se crea un segundo borrador.
  - CA-04-2. Dado F30 llega otra vez después de 2 minutos, Cuando se procesa, Entonces se trata como un gasto nuevo (decisión: la ventana es configurable; ver RIESGO-06).
  - CA-04-3. Dado un mismo monto en otro comercio, Cuando llega, Entonces no se considera duplicado.

**RF-05 Cola local cifrada.**
- Descripción: los borradores de captura pendientes (ya parseados, sin el texto bruto) se guardan en una base local cifrada. El texto bruto de la notificación no se persiste nunca.
- Reutiliza: nada existente. Requiere almacenamiento cifrado (NFR-01).
- Criterios:
  - CA-05-1. Dado que se encola un borrador, Cuando se inspecciona el archivo de la base en disco, Entonces no aparece ni el monto en claro ni el texto del aviso (verificación con prueba instrumentada).
  - CA-05-2. Dado que se reinicia el teléfono con borradores pendientes, Cuando se abre la app, Entonces los borradores siguen disponibles.
  - CA-05-3. Dado un borrador con más de 7 días sin confirmar, Cuando se abre la app, Entonces se elimina y no se propone (límite propuesto, a confirmar).
  - CA-05-4. Dado que se borra la sesión, Cuando se cierra sesión, Entonces la cola se vacía.

**RF-06 Notificación propia con acciones.**
- Descripción: por cada borrador se muestra una notificación de Contigo con las acciones «Guardar», «Cambiar categoría» e «Ignorar». Sin datos sensibles más allá de monto y comercio, y con el texto bruto ausente.
- Reutiliza: nada existente (la app web no notifica capturas).
- Criterios:
  - CA-06-1. Dado un borrador de F01, Cuando se muestra la notificación, Entonces el título dice «Gasto detectado» y el cuerpo contiene el monto y el comercio, y ningún otro texto del aviso original.
  - CA-06-2. Dado que la persona toca «Guardar», Cuando termina la acción, Entonces se crea el gasto con los datos del borrador y se retira la notificación.
  - CA-06-3. Dado que la persona toca «Ignorar», Cuando termina, Entonces el borrador se elimina y no se vuelve a proponer.
  - CA-06-4. Dado que la persona toca «Cambiar categoría», Cuando termina, Entonces se abre la pantalla de RF-07 con la categoría vacía.
  - CA-06-5. Dado que la notificación de Contigo está en pantalla de bloqueo, Cuando se muestra, Entonces el monto se oculta si la persona activó «ocultar en pantalla de bloqueo» (valor por defecto a decidir; ver RIESGO-11).

**RF-07 Pantalla «Confirmar gasto» precargada.**
- Descripción: al abrir un borrador, la pantalla muestra monto, comercio, fecha y categoría sugerida ya escritos, con los mismos controles que «Registrar» (`screens/Register.tsx`).
- Reutiliza: el formulario de `Register.tsx` y `register.ts` (`readNotice`).
- Criterios:
  - CA-07-1. Dado un borrador con categoría sugerida, Cuando se abre la pantalla, Entonces la categoría aparece seleccionada y se puede cambiar.
  - CA-07-2. Dado un borrador sin categoría sugerida, Cuando se abre, Entonces la categoría queda vacía y el botón «Guardar» pide elegir una.
  - CA-07-3. Dado que la persona cambia el monto, Cuando guarda, Entonces se guarda el monto editado y no el original.

**RF-08 Aprendizaje comercio → categoría.**
- Descripción: la categoría sugerida sale de `suggestCategory`, que ya aprende del historial de gastos con nota. El historial debe estar disponible en local para funcionar sin conexión.
- Reutiliza: `web/src/lib/categorize.ts` (`suggestCategory`, `suggestShared`), con 15 tests. Ya existe el aprendizaje; no hay tabla de reglas aparte.
- Criterios:
  - CA-08-1. Dado que la persona ya guardó 3 veces «Almacen Demo» en «Supermercado», Cuando llega un nuevo aviso de ese comercio, Entonces la sugerencia es «Supermercado».
  - CA-08-2. Dado que un comercio conocido no tiene historial (p. ej. «Farmacia Demo Norte»), Cuando llega, Entonces se usa la lista fija `KNOWN` y, si no coincide, no se sugiere nada (no se inventa).
  - CA-08-3. Dado que la persona cambia la categoría de un borrador, Cuando lo guarda, Entonces esa elección pasa a contar en el historial local (el aprendizaje se actualiza sin esperar al servidor).

**RF-09 Modo confirmar vs automático.**
- Descripción: por defecto, todo borrador pide confirmación (modo «Confirmar»). Opcionalmente, en modo «Automático», los gastos con categoría sugerida y monto menor a un límite se guardan solos, con aviso y botón «Deshacer» durante 10 segundos. Los abonos y retiros nunca se guardan solos.
- Reutiliza: `categorize.ts` para decidir si hay sugerencia. Umbral y límites: propuestos.
- Criterios:
  - CA-09-1. Dado el modo «Confirmar», Cuando llega F01, Entonces se crea un borrador y no un gasto.
  - CA-09-2. Dado el modo «Automático» y un comercio con categoría sugerida y monto menor al límite, Cuando llega, Entonces se guarda y se muestra «Deshacer» durante 10 segundos.
  - CA-09-3. Dado el modo «Automático» y que la persona toca «Deshacer» dentro de 10 segundos, Cuando lo hace, Entonces el gasto se borra y no queda en la base.
  - CA-09-4. Dado el modo «Automático» y un abono (F06) o un retiro (F25), Cuando llega, Entonces se pide confirmación.
  - CA-09-5. Dado el modo «Automático» y un comercio sin categoría sugerida, Cuando llega, Entonces se pide confirmación.

### 2.2 Push nativo entre los dos miembros (c)

**RF-10 Aviso nativo a la pareja (FCM) cuando uno registra un gasto o aporte.**
- Descripción: al guardar un gasto o un aporte, la pareja recibe una notificación push nativa, con el mismo contenido y reglas que hoy hace `supabase/functions/notify/index.ts` (monto, categoría, «personal» si no es compartido, un solo aviso por registro, ventana de 5 minutos, privacidad de gastos personales y de aportes). El token FCM se guarda por dispositivo.
- Reutiliza: `supabase/functions/notify/index.ts` (validaciones y textos), `push.ts` (`notifyPartner`), `members.share_personal` y `members.share_savings` (`supabase/migrations/20261027120000_privacidad_pareja.sql`), `expenses.notified_at` y `contributions.notified_at` (`supabase/migrations/20261102120000_seguridad_endurece.sql`).
- Nota: la tabla `push_subscriptions` tiene columnas de Web Push (`endpoint`, `p256dh`, `auth_key`). La versión nativa requiere una **migración nueva** (no editar la existente) con el token FCM, y un emisor FCM en la función. No se aplica en este agente.
- Criterios:
  - CA-10-1. Dado que Ana guarda un gasto compartido de 12.990 en Supermercado, Cuando se guarda, Entonces el dispositivo de Beto recibe un push con «Ana registró un gasto» y «$12.990 en Supermercado».
  - CA-10-2. Dado que Ana guarda un gasto personal y `share_personal = false`, Cuando se guarda, Entonces Beto no recibe nada.
  - CA-10-3. Dado un gasto ya notificado (`notified_at` no nulo), Cuando se vuelve a pedir el aviso, Entonces no se envía de nuevo.
  - CA-10-4. Dado un gasto con más de 5 minutos, Cuando se pide el aviso, Entonces la función responde 403 y no envía.
  - CA-10-5. Dado que Beto salió del hogar (`left_at` no nulo), Cuando Ana guarda, Entonces Beto no recibe el aviso.
  - CA-10-6. Dado que el envío FCM falla, Cuando ocurre, Entonces el guardado del gasto no falla y el error queda registrado sin datos sensibles.
  - CA-10-7. Dado que Beto desactiva los avisos en la app, Cuando Ana guarda, Entonces Beto no recibe nada.
  - CA-10-8. Dado que el token FCM de un dispositivo deja de ser válido, Cuando el envío responde «token no registrado», Entonces ese token se elimina de `push_subscriptions`.

### 2.3 Experiencia nativa (d)

**RF-11 Navegación y botón atrás de Android.**
- Descripción: la navegación usa las pestañas de `Shell.tsx`. El botón atrás vuelve a la pestaña anterior, cierra primero el modal o la hoja abierta, y solo sale de la app desde «Inicio».
- Reutiliza: `Shell.tsx` (estado `tab`), `components/Modal.tsx`.
- Criterios:
  - CA-11-1. Dado que hay un modal abierto, Cuando se pulsa atrás, Entonces se cierra el modal y no cambia la pestaña.
  - CA-11-2. Dado que la pestaña es Gastos (y no hay modal), Cuando se pulsa atrás, Entonces se vuelve a Inicio.
  - CA-11-3. Dado que la pestaña es Inicio, Cuando se pulsa atrás, Entonces la app se minimiza (no se cierra la sesión).
  - CA-11-4. Dado que se llega desde un aviso (RF-06), Cuando se pulsa atrás en Confirmar gasto, Entonces vuelve a la pantalla anterior y el borrador queda en la cola.

**RF-12 Áreas seguras y teclado.**
- Descripción: el contenido respeta la barra de estado, la barra de navegación de Android y la barra inferior de pestañas. Al abrir el teclado, el campo activo queda visible y los botones «Guardar» no quedan tapados.
- Reutiliza: `index.html` ya tiene `viewport-fit=cover`; `Shell.tsx` tiene la barra inferior `nav.tabbar`.
- Criterios:
  - CA-12-1. Dado un teléfono con barra de navegación por gestos, Cuando se muestra cualquier pantalla, Entonces la barra inferior no se superpone con el contenido.
  - CA-12-2. Dado el formulario de Registrar con el teclado abierto, Cuando se enfoca el campo «Monto», Entonces el campo y el botón «Guardar» son visibles.

**RF-13 Háptica.**
- Descripción: vibración suave al guardar, al confirmar un borrador y al fallar el desbloqueo. Respeta la preferencia de sistema de «sin vibración» y tiene opción de apagarla en la app.
- Reutiliza: nada existente (la web no tiene háptica).
- Criterios:
  - CA-13-1. Dado que se guarda un gasto, Cuando termina con éxito, Entonces se dispara una vibración de confirmación.
  - CA-13-2. Dado que la persona apagó la háptica en Ajustes, Cuando se guarda, Entonces no hay vibración.
  - CA-13-3. Dado que el sistema tiene la vibración desactivada, Cuando se guarda, Entonces no hay vibración.

**RF-14 Modo oscuro.**
- Descripción: sigue la preferencia del sistema o se fija en claro u oscuro en Ajustes (igual que hoy).
- Reutiliza: `web/src/lib/theme.ts` (`getThemePref`, `applyTheme`), `ThemeToggle.tsx`.
- Criterios:
  - CA-14-1. Dado que la preferencia es «sistema» y el sistema está en oscuro, Cuando se abre la app, Entonces se ve en oscuro.
  - CA-14-2. Dado que la persona elige «claro», Cuando reinicia la app, Entonces sigue en claro.
  - CA-14-3. Dado el modo oscuro, Cuando se muestra la barra de estado, Entonces su color coincide con el fondo de la app.

**RF-15 Splash e ícono.**
- Descripción: ícono adaptativo de Android (capa de primer plano y de fondo) con el logo de Contigo y color de marca `#FDE2E4` (tomado de `web/index.html`, `theme-color`). Pantalla de inicio con el mismo fondo y logo, sin parpadeo blanco.
- Reutiliza: `web/public/` y `web/pwa-assets.config.ts` (fuentes de logo; NO VERIFICADO el contenido exacto de las imágenes).
- Criterios:
  - CA-15-1. Dado el arranque en frío, Cuando aparece el splash, Entonces su fondo es el de la marca en modo claro y el de la app en modo oscuro (sin destello blanco).
  - CA-15-2. Dado el ícono en el launcher, Cuando se muestra en forma circular y cuadrada, Entonces el logo queda centrado y completo (prueba visual manual).

**RF-16 Bloqueo con biometría (reutiliza applock).**
- Descripción: el bloqueo por inactividad de `applock.ts` se mantiene (minutos: nunca, 1, 5, 15). Al bloquear, se pide huella o rostro del sistema; si no hay biometría, se pide la contraseña de la cuenta, como hoy (`LockScreen.tsx`). El tiempo de inactividad se mide desde que la app pasa a segundo plano.
- Reutiliza: `lib/applock.ts` (`shouldLock`, `touch`, `lastActive`, `LOCK_OPTIONS`), `lib/useAppLock.ts`, `components/LockScreen.tsx`, `components/LockSettings.tsx`. La persistencia pasa de localStorage a almacenamiento nativo (DEC-03).
- Criterios:
  - CA-16-1. Dado el bloqueo en 1 minuto y la app en segundo plano 61 segundos, Cuando vuelve al frente, Entonces aparece el bloqueo (prueba unitaria con `shouldLock` y tiempo explícito, sin mockear el reloj, según AGENTS.md).
  - CA-16-2. Dado el bloqueo activo y biometría disponible, Cuando la persona se autentica bien, Entonces se desbloquea.
  - CA-16-3. Dado que la biometría falla cinco veces, Cuando ocurre, Entonces se pide la contraseña de la cuenta (mismo límite de intentos que `security.ts`).
  - CA-16-4. Dado el bloqueo en «Nunca», Cuando la app vuelve al frente tras horas, Entonces no se bloquea.
  - CA-16-5. Dado que la app se cierra por completo con el bloqueo puesto, Cuando se abre, Entonces sigue bloqueada.

**RF-17 Arranque rápido.**
- Descripción: en frío, la primera pantalla visible (Inicio con datos en caché o un cargador ligero) en menos de 2 segundos en un equipo de gama media (objetivo a medir). Las pantallas diferidas siguen siendo `lazy`.
- Reutiliza: `Shell.tsx` (`lazy`, precarga en líneas 44-47), `ScreenLoader.tsx`, `ActivityLoader.tsx` (muestra el cargador solo si la espera supera un umbral).
- Criterios:
  - CA-17-1. Dado un arranque en frío con datos en caché, Cuando se abre la app, Entonces Inicio se muestra antes de que termine la consulta a Supabase (medido con marca de tiempo; objetivo < 2 s en gama media, NO VERIFICADO el valor real).
  - CA-17-2. Dado que la consulta tarda más de un umbral, Cuando ocurre, Entonces el cargador aparece; si tarda menos, no parpadea.

**RF-18 Funcionamiento sin conexión con cola.**
- Descripción: sin conexión, la app muestra lo que ya cargó (caché local cifrada) y encola las escrituras (gasto, aporte, gasto fijo, meta, borrado). Al volver la conexión, las envía en orden, con el identificador generado en el cliente (`newId`), así un reintento no duplica (ver `lib/idempotency.ts`, código `23505`). Hoy la app no hace esto: `OfflineBar` dice «los cambios no se guardarán», y `trackedFetch` no reintenta escrituras (`WRITE.retries = 0`).
- Reutiliza: `lib/idempotency.ts`, `lib/resilience.ts` (backoff), `lib/trackedFetch.ts`. Cola: nueva (RF-05).
- Criterios:
  - CA-18-1. Dado que no hay conexión, Cuando se guarda un gasto, Entonces aparece en la lista como «pendiente» y se encola.
  - CA-18-2. Dado que vuelve la conexión con dos gastos encolados, Cuando se envían, Entonces se guardan en el orden de creación y ninguno queda duplicado aunque el envío se repita (mismo id, código 23505 se trata como éxito).
  - CA-18-3. Dado que el envío responde error de validación (p. ej. monto no válido), Cuando ocurre, Entonces el registro queda marcado como «revisar» y no se reintenta en bucle.
  - CA-18-4. Dado que la app se cierra con elementos encolados, Cuando se reabre con red, Entonces se envían.
  - CA-18-5. Dado que la persona abre Inicio sin conexión, Cuando hay caché, Entonces ve los datos del último sincronizado con una marca de «hace X minutos».
  - CA-18-6. Dado un gasto encolado que la pareja borró en el servidor, Cuando se intenta enviar la edición, Entonces se informa el conflicto y no se sobrescribe en silencio (NO VERIFICADO el modelo de conflicto; ver RIESGO-08).

**RF-19 Paridad funcional total.**
- Descripción: todas las funciones de la sección 1 (pantallas, componentes y módulos) existen en la app Android con el mismo comportamiento, salvo las marcadas como solo-web (instalación PWA, service worker, `beforeinstallprompt`, pantalla de instalación), que se eliminan y se reemplazan por lo nativo.
- Reutiliza: todo el código de `web/src` (vía Capacitor, WebView).
- Criterios:
  - CA-19-1. Dado el inventario de la sección 1, Cuando se recorre cada ítem en Android, Entonces cada uno funciona o tiene una nota de exclusión aprobada.
  - CA-19-2. Dado que existen pruebas E2E de web (`web/e2e/e2e.cjs`, `mfa.cjs`, `google-setup.cjs`), Cuando se portan al entorno nativo, Entonces los mismos flujos pasan en Android (ver sección 4).
  - CA-19-3. Dado el cierre de sesión, Cuando se confirma, Entonces se borran sesión, cola y datos de `wipe.ts` del dispositivo.

**RF-20 Compartir un aviso hacia Contigo (Android).**
- Descripción: desde la app del banco, «Compartir» muestra Contigo como destino. El texto llega a Registrar ya leído con `parseBankNotice`, igual que hoy con `?text=` (`bankNotice.ts`, `readSharedNotice`).
- Reutiliza: `readSharedNotice`, `Shell.tsx` (estado `notice`), `Register.tsx` (`readNotice`).
- Criterios:
  - CA-20-1. Dado un texto compartido con F01, Cuando llega a Contigo, Entonces se abre Registrar con monto, comercio y fecha precargados.
  - CA-20-2. Dado un texto compartido vacío, Cuando llega, Entonces se abre Inicio sin error.
  - CA-20-3. Dado un texto compartido de más de 1.000 caracteres, Cuando llega, Entonces se corta a 1.000 (como hoy).

**RF-21 Inicio de sesión con Google nativo.**
- Descripción: el botón de Google abre la cuenta del sistema y entrega un token de identidad con nonce a `signInWithGoogleToken` (DEC-02). No se usa redirección.
- Reutiliza: `lib/google.ts` (`signInWithGoogleToken`, `markTermsAccepted`, nonce), `components/GoogleButton.tsx` (lógica de fallback).
- Criterios:
  - CA-21-1. Dado que la persona elige una cuenta de Google, Cuando el token llega, Entonces se inicia sesión y se marca la aceptación de términos (`markTermsAccepted`).
  - CA-21-2. Dado que no hay Google Play Services o la cuenta falla, Cuando ocurre, Entonces se muestra el mensaje de `GOOGLE_ERROR` y el correo y contraseña siguen disponibles.
  - CA-21-3. Dado un token con nonce distinto al enviado, Cuando Supabase lo valida, Entonces el inicio de sesión se rechaza.

**RF-22 Recuperación de contraseña y enlaces del correo.**
- Descripción: el enlace de «olvidé mi contraseña» abre la app (enlace de app verificado) y no el navegador. La pantalla `ResetPassword` continúa el flujo.
- Reutiliza: `lib/recovery.ts` (`consumeRecoveryLink`), `screens/ResetPassword.tsx`.
- Criterios:
  - CA-22-1. Dado un enlace de recuperación válido, Cuando se abre desde el correo, Entonces abre Contigo en `ResetPassword`.
  - CA-22-2. Dado un enlace caducado, Cuando se abre, Entonces se muestra el mensaje de enlace inválido y la opción de pedir uno nuevo.
  - CA-22-3. Dado que el enlace de recuperación se usó, Cuando se intenta de nuevo, Entonces no inicia sesión.

**RF-23 Respaldo como archivo.**
- Descripción: la copia del hogar se genera igual que hoy (`lib/backup.ts`) y se entrega con la hoja de compartir o al almacenamiento de descargas, sin `blob:` ni `<a download>`.
- Reutiliza: `lib/backup.ts`, `components/BackupCard.tsx`.
- Criterios:
  - CA-23-1. Dado que la persona pulsa «Descargar copia», Cuando termina, Entonces aparece la hoja de compartir con un archivo JSON.
  - CA-23-2. Dado que la persona cancela la hoja, Cuando lo hace, Entonces no aparece error.
  - CA-23-3. Dado el archivo generado, Cuando se abre, Entonces su contenido es el mismo que el de la versión web para el mismo hogar.

**RF-24 Actualizaciones.**
- Descripción: la app avisa de una versión nueva consultando la tienda (o un aviso propio, NO VERIFICADO). Reemplaza al service worker de `lib/update.ts` y `UpdateBanner.tsx`.
- Reutiliza: la interfaz de `UpdateBanner.tsx` (texto y botón); cambia el origen del aviso.
- Criterios:
  - CA-24-1. Dado que hay una versión más nueva en la tienda, Cuando se abre la app, Entonces aparece el aviso con «Actualizar».
  - CA-24-2. Dado que no hay red, Cuando se abre la app, Entonces no aparece el aviso y la app funciona.

**RF-25 Avisos inteligentes locales.**
- Descripción: los avisos de `smartNotify.ts` se muestran como notificaciones locales, con las mismas reglas: no molestar de 22:00 a 08:00, máximo 1 por día, y recordatorio de avisos urgentes cada 3 días.
- Reutiliza: `smartNotify.ts` (reglas), `smartAlerts.ts` (fuente de los avisos).
- Criterios:
  - CA-25-1. Dado que son las 23:00, Cuando hay un aviso, Entonces no se muestra y queda para la mañana siguiente.
  - CA-25-2. Dado que ya se mostró un aviso hoy, Cuando hay otro, Entonces no se muestra.
  - CA-25-3. Dado un aviso urgente sin resolver hace 3 días, Cuando se revisa, Entonces se vuelve a recordar.
  - CA-25-4. Dado que la persona apaga los avisos inteligentes, Cuando hay un aviso, Entonces no se muestra (`smartNotifyEnabled`).

**RF-26 Pegar aviso desde el portapapeles.**
- Descripción: el botón «Pegar aviso» de Registrar sigue existiendo. Usa el portapapeles del sistema por plugin y muestra el mensaje de respaldo si no hay permiso.
- Reutiliza: `screens/Register.tsx` (`pasteNotice`, línea 160), mensaje de error existente.
- Criterios:
  - CA-26-1. Dado un texto de F01 en el portapapeles, Cuando se pulsa «Pegar aviso», Entonces se lee y se parsea.
  - CA-26-2. Dado que no se puede leer el portapapeles, Cuando se pulsa, Entonces aparece «No pudimos leer lo copiado».

**RF-27 Enlace profundo para registrar un gasto (nido://).**
- Descripción: la app acepta un enlace `nido://gasto?monto=...&comercio=...` (y opcionalmente `fecha=`) que abre Confirmar gasto precargado. Es la vía que usará iOS (ver sección 7) y también sirve para automatizaciones de Android. Los parámetros se validan igual que RF-02 y el monto no puede ser cero ni negativo.
- Reutiliza: el mismo flujo de RF-07; `readSharedNotice` ya lee `#text=` desde una automatización (`bankNotice.ts`).
- Criterios:
  - CA-27-1. Dado `nido://gasto?monto=4500&comercio=Cafe%20Demo`, Cuando se abre, Entonces Confirmar gasto muestra 4500 y «Cafe Demo».
  - CA-27-2. Dado `nido://gasto?monto=0`, Cuando se abre, Entonces no se abre borrador y se muestra un aviso.
  - CA-27-3. Dado `nido://gasto?monto=12000` sin sesión, Cuando se abre, Entonces primero se pide iniciar sesión y después se conserva el borrador (no se guarda sin sesión).

### 2.4 Nota sobre el estado actual

- Hoy la captura existe solo como **pegado manual** y **compartir desde otra app** (`Register.tsx`, `bankNotice.ts`). No hay lectura automática de notificaciones (verificado: no hay `NotificationListenerService` ni código equivalente; el repo no contiene código Android ni Capacitor, buscado por grep en todo el árbol).
- Hoy no hay cola sin conexión (ver RF-18).

### 2.5 Requisitos no funcionales

**NFR-01 Seguridad y privacidad.**
- El texto bruto de una notificación nunca sale del teléfono: no se envía a Supabase, no se registra en logs de producción, no se guarda en la cola ni en respaldos.
  - CA-NFR01-1. Dado un aviso capturado, Cuando se envía cualquier petición de red, Entonces el cuerpo no contiene el texto bruto (prueba instrumentada del cliente HTTP).
  - CA-NFR01-2. Dado un build de release, Cuando se revisa `logcat` durante una captura, Entonces no aparece el texto del aviso ni el monto en claro.
- La cola local está cifrada con una clave guardada en el almacén seguro del sistema (Android Keystore). CA: el archivo de la base no contiene texto legible (RF-05 CA-05-1).
- La sesión de Supabase se guarda en almacenamiento seguro y no en localStorage (DEC-03). CA: tras cerrar sesión, no queda ningún token en el almacenamiento de la WebView.
- Lista blanca: solo paquetes aprobados por la persona (RF-01). CA: un paquete fuera de la lista no se lee.
- Copias de seguridad de Android: los datos de la cola y la sesión quedan excluidos de la copia automática del sistema (reglas de extracción de datos; NO VERIFICADO el detalle de atributos).
- Captura de pantalla: la app aplica `FLAG_SECURE` (`web/android/app/src/main/java/cl/dinovance/contigo/MainActivity.java:20`): no se pueden hacer capturas de la app. Comprobación en teléfono real pendiente.
- Sin permisos adicionales fuera de los necesarios: acceso a notificaciones (captura), notificaciones (avisos), biometría, red. CA: el manifiesto no incluye permisos no listados aquí (revisión manual).
- Cumplir RLS existente: la app nunca consulta tablas sin filtro de hogar. Las pruebas SQL existentes (`supabase/tests/*.sql`) no cambian.

**NFR-02 Rendimiento.**
- Arranque en frío: objetivo a medir, Inicio visible en < 2 s en gama media (NO VERIFICADO el valor).
- Parseo de un aviso: < 10 ms en el teléfono (prueba unitaria con 1.000 avisos, objetivo a confirmar).
- Consumo de batería: la captura no debe mantener procesos activos (el servicio es del sistema). CA: sin wakelocks propios (revisión).
- Tamaño de la app: a definir (NO VERIFICADO).

**NFR-03 Accesibilidad.**
- Los controles tienen nombre accesible (`aria-label` ya usado en la web: `Shell.tsx` línea 236 «Principal»). Los avisos de estado usan `role="status"` (`OfflineBar.tsx`).
- Tamaño de texto del sistema respetado (hasta 200 %) sin cortar botones.
- Contraste de los textos en modo claro y oscuro (WCAG AA; NO VERIFICADO sobre los colores actuales).
- El lector de pantalla (TalkBack) lee las notificaciones de captura con monto y comercio.

**NFR-04 Fiabilidad en segundo plano (Doze y fabricantes).**
- La captura depende del servicio de notificaciones del sistema. Algunos fabricantes detienen estos servicios para ahorrar batería. CA: la app detecta si el servicio está conectado y muestra un aviso con el paso para permitirlo (ver RIESGO-02).
- Los avisos push para la pareja usan mensajes de prioridad alta solo para gastos y aportes, para que lleguen en Doze (NO VERIFICADO el límite de cuota de FCM).
- Las pantallas al volver del fondo recargan solo lo necesario (`data.ts` ya hace esto con `STALE_AFTER_MS`, línea 74).

**NFR-05 Mantenibilidad y pruebas.**
- Un solo conjunto de fixtures (sección 3) para TS y Kotlin.
- Cada requisito tiene al menos un test automático antes de cerrarse (sección 5).

**NFR-06 Compatibilidad.**
- Android: versión mínima a definir (SUP-01). Tablet fuera de alcance en esta fase.
- Idioma: español de Chile; textos en `web/src`. Sin cambio de idioma en esta fase.

---

## 3. Fixtures: avisos bancarios chilenos SINTÉTICOS

**Aviso importante:** todos los textos siguientes son **ficticios e inventados**. No provienen de ningún banco, comercio, persona ni tarjeta real. Los nombres (Banco Demo, Almacén Demo, Persona Demo, etc.), los números de tarjeta (`*0000`, que no existe), los códigos y los montos son de prueba. Cualquier parecido con una entidad o persona real es casual. Estos fixtures deben vivir en `web/src/lib/__fixtures__/notificaciones-sinteticas.json` con un campo `"sintetico": true` en cada caso y un encabezado que lo declare.

Paquetes de origen: ficticios (`cl.demo.banco`, `cl.demo.billetera`, `com.ejemplo.redsocial`). **No** se usan nombres de paquetes reales.

Fecha de referencia para todos los casos: `now = 2026-11-21`.

**Resultado esperado** es la especificación que el parser debe cumplir. No es una salida verificada del parser actual. Los resultados marcados con `descartar` o `ingreso` describen el requisito, no lo que hace el código hoy.

| ID | Paquete (sintético) | Texto del aviso (sintético) | Resultado esperado |
|---|---|---|---|
| F01 | cl.demo.banco | Compra aprobada por $12.990 en ALMACEN DEMO SPA con tu tarjeta *0000 el 14/11/2026. | gasto 12990 · «Almacen Demo Spa» · 2026-11-14 |
| F02 | cl.demo.banco | Compra por CLP 4500 en CAFE DEL TEST. Tarjeta terminada en 0000. | gasto 4500 · «Cafe Del Test» · hoy |
| F03 | cl.demo.banco | Compra de 8.500 pesos en Tienda Ejemplo Ñuñoa, 13/11. | gasto 8500 · «Tienda Ejemplo Ñuñoa» · 2026-11-13 |
| F04 | cl.demo.banco | Compra en 3 cuotas sin interés por $45.000 en PRUEBA ELECTRO. Primera cuota: $15.000. | gasto 15000 (cuota 1 de 3) · «Prueba Electro» · nota «cuota 1 de 3» (decisión, RIESGO-04) |
| F05 | cl.demo.banco | Pago cuota 2 de 6 por $22.300 de crédito de consumo demo. | no es gasto nuevo: se descarta de la captura (es pago de deuda, RIESGO-05) |
| F06 | cl.demo.banco | Abono de $350.000 en tu cuenta corriente demo. Origen: EMPRESA FICTICIA SA. | ingreso (no gasto) |
| F07 | cl.demo.billetera | Recibiste una transferencia de $60.000 de Persona Demo el 12/11/2026. | ingreso (no gasto) |
| F08 | cl.demo.banco | Transferencia realizada a Juana Ejemplo por $20.000 el 10/11/2026. | gasto 20000 · «Juana Ejemplo» · 2026-11-10 |
| F09 | cl.demo.banco | Devolución de compra por $9.990 en TIENDA DEMO. Reverso aplicado. | ingreso (devolución), no gasto |
| F10 | cl.demo.banco | Tu clave dinámica es 482913. No la compartas con nadie. | descartar (sin monto; RF-03) |
| F11 | cl.demo.banco | Clave para compra de $35.000 en COMERCIO DEMO: 771204. No compartas este código. | descartar por «clave» / «código» aunque tenga monto (RF-03) |
| F12 | cl.demo.banco | ¡Oferta exclusiva! Ahorra $5.000 en tu próxima compra con cupón DEMO24. | descartar (promoción; RF-03) |
| F13 | cl.demo.billetera | 20% de descuento en tiendas demo hasta el 30/11. | descartar (promoción sin monto) |
| F14 | cl.demo.banco | Compra por US$ 12.00 en SHOP DEMO INC. | descartar (moneda extranjera) |
| F15 | cl.demo.banco | Compra por $1.234,50 en Kiosco Demo. | gasto 1234 · «Kiosco Demo» |
| F16 | cl.demo.banco | Compra por $1.250.000 en MUEBLES DEMO el 01/11/2026. | gasto 1250000 · «Muebles Demo» · 2026-11-01 |
| F17 | cl.demo.billetera | Pagaste $99999 en MINIMARKET DEMO. | gasto 99999 · «Minimarket Demo» |
| F18 | cl.demo.banco | Compra por $3.200 en PANADERÍA EL ÑANDÚ 13/11. | gasto 3200 · «Panadería El Ñandú» (con acentos y ñ) · 2026-11-13 |
| F19 | cl.demo.banco | Compra por $7.800 en Farmacia Demo Norte el 11/11/2026. | gasto 7800 · «Farmacia Demo Norte» (sin cambiar mayúsculas mezcladas) · 2026-11-11 |
| F20 | cl.demo.billetera | Compra por $2.990 en PIZZA-DEMO #12. | gasto 2990 · «Pizza-Demo #12» |
| F21 | cl.demo.banco | Cargo por $4.000 aprobado en tu tarjeta *0000. | gasto 4000 · sin comercio (queda vacío, confirmar) |
| F22 | cl.demo.banco | Tu saldo disponible es de $210.000 al 14/11. | descartar (saldo, no movimiento; RF-03) |
| F23 | cl.demo.billetera | Pago de servicio por $18.500 a Empresa Demo Agua. | gasto 18500 · «Empresa Demo Agua» |
| F24 | cl.demo.banco | Compra online aprobada por $25.990 en TIENDA WEB DEMO.COM | gasto 25990 · «Tienda Web Demo.com» |
| F25 | cl.demo.banco | Retiro de $50.000 en cajero ATM DEMO 3. | retiro: siempre confirmar, nunca automático (RF-02, CA-02-7) |
| F26 | com.ejemplo.redsocial | Tu estado de cuenta de noviembre ya está disponible. | descartar (sin monto y de otra familia) |
| F27 | com.ejemplo.redsocial | Compra aprobada por $12.990 en ALMACEN DEMO SPA. | descartar por lista blanca (RF-01); mismo texto que F01 pero de paquete no aprobado |
| F28 | cl.demo.banco | Compra rechazada por $15.000 en COMERCIO DEMO: fondos insuficientes. | descartar (no se cobró; RF-03) |
| F29 | cl.demo.banco | Compra aprobada por $9.000 en TIENDA TEST el 31/02/2026. | gasto 9000 · fecha inválida → hoy |
| F30 | cl.demo.banco | Compra aprobada por $6.500 en CAFE DEMO NORTE el 21/11/2026. | gasto 6500 · duplicado si llega dos veces en 2 min (RF-04) |
| F31 | cl.demo.banco | Compra aprobada por $6.500 en CAFE DEMO NORTE el 30/12/2026. | gasto 6500 · fecha futura → hoy |
| F32 | cl.demo.billetera | Te devolvimos $1.990 de la compra en TIENDA DEMO. | ingreso (devolución), no gasto |

Notas de cobertura: compras (F01-F03, F15-F21, F24), cuotas (F04, F05), abonos y transferencias recibidas (F06, F07, F09, F32), transferencias enviadas (F08, F23), OTP (F10, F11), promociones (F12, F13), moneda extranjera (F14), montos con y sin puntos (F02, F03, F15-F17), CLP/$/pesos (F02, F03, F15), mayúsculas y acentos (F18, F19), descartados (F22, F26, F27, F28), fechas (F29, F31), duplicado (F30), retiro (F25).

---

## 4. Casos límite y riesgos por requisito

| ID | Caso límite | Riesgo | Mitigación / decisión |
|---|---|---|---|
| RF-01 | Notificación de un paquete con el mismo texto que un banco (p. ej., reenviada) | Captura de texto de una app no bancaria | La lista la aprueba la persona; el paquete se verifica con `sbn.packageName` |
| RIESGO-02 | El fabricante mata el servicio de notificaciones | Se pierden compras sin aviso | Detección de estado y guía de permisos (NFR-04); registro de último aviso recibido para mostrar «no recibimos avisos desde…» |
| RF-02 | Montos escritos con punto como separador decimal, o con espacio de miles | Monto mal leído | Fixtures F15-F17; tests en Kotlin y TS |
| RF-02 | Comercio que contiene «en» o «por» (p. ej., «Restaurante En La Playa») | Comercio cortado | Ver `STOP` en `bankNotice.ts`. Fixture nuevo necesario (NO VERIFICADO con el parser actual) |
| RF-02 | Texto sin comercio (F21) | Gasto sin nombre | Se entrega el monto y el comercio vacío; se pide confirmar |
| RF-02 | Cuotas: ¿se registra el total o la cuota? | Gasto inflado o incompleto | Decisión de producto: registrar la cuota con nota (CA-02-6). Mostrar el total en la nota |
| RIESGO-04 | Compras en cuotas con mensualidad distinta cada mes | Descuadre con el presupuesto | Pendiente de decisión (cuota vs total) |
| RIESGO-05 | Pago de cuota de deuda (F05) | Se cuenta dos veces (gasto y pago de deuda) | Clasificar como pago de deuda; no proponer gasto (CA-02-8) |
| RF-03 | OTP con monto (F11): el parser actual leería el `$` como gasto | Gasto falso | Lista de palabras de seguridad antes de extraer (CA-03-2). **Según lectura de código, NO VERIFICADO por ejecución** |
| RF-03 | Promoción con monto (F12) o saldo (F22) | Gasto falso | Lista de palabras de promoción y saldo (CA-03-3, CA-03-4). **NO VERIFICADO por ejecución** |
| RF-03 | Idioma: texto en inglés de algún banco | No se reconoce compra | Fuera de alcance: los bancos deben usar español; ampliar fixtures si aparecen |
| RF-04 | Mismo cargo en dos notificaciones distintas con textos diferentes | Duplicado no detectado | Ventana de 2 min y huella por monto+fecha. Riesgo bajo |
| RF-04 | Compra legítima igual a otra en 2 min (dos cafés del mismo monto) | Se descarta una compra real | Ventana configurable; la confirmación manual lo resuelve (RIESGO-06) |
| RF-05 | Teléfono con cifrado no disponible (dispositivo muy antiguo) | Cola sin cifrar | Requiere API mínima con Keystore (SUP-01). Si no hay, no capturar |
| RF-05 | Borrado de la cuenta con borradores pendientes | Datos que siguen en el teléfono | Vaciar la cola al borrar cuenta y al cerrar sesión (CA-05-4) |
| RF-06 | Notificación en pantalla de bloqueo con el monto | Se ve el gasto sin desbloquear | Opción de ocultar en pantalla de bloqueo (RIESGO-11) |
| RF-06 | Varias capturas seguidas: pila de notificaciones | Ruido, la persona ignora | Agrupar en una sola notificación con contador |
| RF-07 | Categoría sugerida que ya no existe (se borró la categoría) | Guardar falla | `suggestCategory` filtra por categorías válidas (`valid` en `categorize.ts`) |
| RF-08 | Historial vacío (primera vez) | No hay sugerencia | Usar lista `KNOWN`; si no coincide, pedir categoría |
| RF-08 | Historial local desactualizado sin conexión | Sugerencia vieja | Aceptable; se actualiza al volver la conexión |
| RF-09 | Modo automático con error de la base | Gasto que no se guardó y no se avisa | Mostrar error y dejar el borrador en la cola (no perder) |
| RF-09 | Deshacer después de que la pareja ya recibió el push | La pareja vio un gasto que se borró | Enviar el push solo tras confirmar, o aceptarlo como caso conocido (decisión, RIESGO-12) |
| RF-10 | Pareja sin FCM instalado o con permiso de notificaciones denegado | No llega el aviso | La app de la pareja muestra estado en Ajustes (`PushToggle`) |
| RF-10 | Migración del esquema de `push_subscriptions` | Pérdida de suscripciones web | Migración nueva (no editar la existente); convivencia web/nativo mientras dure la PWA |
| RF-10 | Clave del emisor FCM | Fuga de credenciales | Se guarda como secreto del proyecto, nunca en el repo. Los agentes no crean ni rotan secretos (AGENTS.md) |
| RF-11 | Botón atrás en medio de un formulario sin guardar | Pérdida de datos | Confirmar antes de salir con cambios sin guardar |
| RF-12 | Teclado en pantallas con `position: fixed` | Botón tapado | Prueba visual en 3 tamaños de pantalla (NO VERIFICADO) |
| RF-13 | Háptica en dispositivos sin motor | Error | Llamada segura (no-op si no hay soporte) |
| RF-14 | Cambio de tema del sistema con la app abierta | Colores mezclados | Escuchar el cambio de tema del sistema |
| RF-16 | Biometría sin enrolar | Bloqueo sin salida | Ofrecer contraseña de la cuenta (CA-16-3) |
| RF-16 | Bloqueo y cambio de hora del teléfono | Bloqueo que no salta o salta siempre | Medir con `Date.now()` monotónico si el plugin lo permite (NO VERIFICADO). `shouldLock` usa `Date.now()` hoy |
| RF-17 | Caché vacía en la primera apertura | Pantalla en blanco | Cargador de `ScreenLoader` con texto |
| RF-18 | Dos dispositivos editan el mismo gasto sin conexión | Conflicto | Último en llegar gana, con aviso de conflicto (CA-18-6); decisión pendiente |
| RF-18 | Cola creciendo sin límite | Uso de almacenamiento | Límite de 500 registros propuesto; avisar |
| RF-18 | Envío parcial: se cae la red a mitad de la cola | Duplicado o pérdida | Mismo id en cada reintento; el código 23505 se trata como éxito (CA-18-2) |
| RF-19 | Función web que no tiene equivalente nativo (instalación PWA) | Pantalla que no sirve | Excluir explícitamente en la lista de exclusiones de QA |
| RF-20 | Compartir desde una app que envía solo el título | Texto vacío | `readSharedNotice` ya junta `title` y `text` |
| RF-21 | Google no disponible en el teléfono | No se puede entrar | Correo y contraseña siguen (CA-21-2) |
| RIESGO-17 | Turnstile (`lib/captcha.ts`) necesita un origen web permitido | El registro y el inicio de sesión fallan en WebView | **NO VERIFICADO**. Probar en prototipo; si falla, decidir entre dominio permitido o alternativa. Supabase exige el captcha (comentario en `captcha.ts`) |
| RF-22 | Enlace de recuperación abierto en otro navegador | No vuelve a la app | Enlaces de app verificados (NO VERIFICADO el detalle de configuración) |
| RF-23 | Respaldo muy grande | Memoria | Escribir por partes (NO VERIFICADO el tamaño real) |
| RF-24 | Versión mínima de Android distinta a la de la tienda | Actualización rota | Probar la actualización en el canal interno |
| RF-25 | Zona horaria: «de noche» según Chile o según el teléfono | Avisos a horas raras | Usar hora de Chile (`America/Santiago`, como ya usa la base) |
| RF-26 | Portapapeles con texto que no es aviso | Mensaje de error | Ya se muestra «no se reconoce el aviso» (`register.ts`) |
| RF-27 | Enlace con monto muy grande o texto raro | Datos corruptos | Mismas validaciones que RF-02 (monto mayor a 0 y menor a 10.000.000.000, límite de la columna `amount`) |
| NFR-01 | Notificación con datos de terceros (nombre de la pareja, RUT) | Exposición de datos ajenos | Solo se extraen monto, comercio y fecha; nunca otros campos |
| NFR-01 | Logs de depuración en producción | Filtrar montos | Sin logs con contenido de aviso en release (CA-NFR01-2) |
| NFR-01 | Sesión robada de un teléfono con root | Acceso a datos | Almacén seguro (hardware si existe); bloqueo con biometría |
| NFR-03 | Fuentes grandes del sistema | Botones cortados | Probar con texto al 200 % |
| NFR-04 | Doze: el push de gasto llega tarde | Pareja ve el gasto horas después | Mensaje de prioridad alta solo para gastos y aportes (NFR-04) |
| NFR-04 | Límites de cuota del servicio de push | Avisos perdidos | NO VERIFICADO; medir |

---

## 5. Matriz requisito → archivo de test (propuesta de rutas)

Convención: los tests de TypeScript van junto al módulo en `web/src/lib` (AGENTS.md, «Cómo se escriben los tests aquí»). Los tests de Kotlin van en `android/app/src/test/kotlin/<paquete>/...`, donde `<paquete>` se fija al crear el proyecto (NO VERIFICADO: el nombre de paquete aún no existe). Las pruebas E2E nativas van en `android/e2e/` (herramienta a elegir; NO VERIFICADO).

| Requisito | Test unitario | Test de lógica TS | Test E2E / instrumentado |
|---|---|---|---|
| RF-01 | `android/app/src/test/kotlin/<paquete>/captura/ListaBlancaTest.kt` | `web/src/lib/captura/listaBlanca.test.ts` | `android/e2e/captura_lista_blanca.yaml` |
| RF-02 | `android/app/src/test/kotlin/<paquete>/captura/ParserAvisoTest.kt` (usa los fixtures) | `web/src/lib/bankNotice.test.ts` (ampliar) y `web/src/lib/__fixtures__/fixtures.test.ts` | `android/e2e/captura_parser.yaml` (smoke) |
| RF-03 | `.../captura/FiltroSeguridadTest.kt` | `web/src/lib/bankNotice.test.ts` (ampliar: F10-F14, F22, F28) | — |
| RF-04 | `.../captura/DeduplicacionTest.kt` (ventana con tiempo explícito) | `web/src/lib/captura/dedupe.test.ts` | — |
| RF-05 | `.../captura/ColaCifradaTest.kt` (instrumentado para Keystore) | `web/src/lib/captura/cola.test.ts` | `android/e2e/cola_reinicio.yaml` |
| RF-06 | `.../captura/NotificacionAccionesTest.kt` | — | `android/e2e/captura_acciones.yaml` |
| RF-07 | — | `web/src/lib/register.test.ts` (ampliar: borrador → formulario) | `android/e2e/confirmar_gasto.yaml` |
| RF-08 | — | `web/src/lib/categorize.test.ts` (ya existe, 15 tests; ampliar CA-08-1 a CA-08-3) | — |
| RF-09 | — | `web/src/lib/captura/modo.test.ts` | `android/e2e/captura_automatica_deshacer.yaml` |
| RF-10 | — | `web/src/lib/push.test.ts` (nuevo, para la parte de tokens y `notifyPartner`) | `supabase/functions/notify/index.test.ts` (nuevo, para CA-10-1 a CA-10-8; **no se ejecuta contra el Supabase real**) |
| RF-11 | — | — | `android/e2e/atras.yaml` |
| RF-12 | — | — | `android/e2e/teclado.yaml` (prueba visual) |
| RF-13 | — | `web/src/lib/haptica.test.ts` | — |
| RF-14 | — | `web/src/lib/theme.test.ts` (nuevo) | `android/e2e/tema.yaml` |
| RF-15 | — | — | prueba visual manual (checklist en `docs/mobile/`) |
| RF-16 | — | `web/src/lib/applock.test.ts` (ya existe, 3 tests; ampliar CA-16-1, CA-16-4) | `android/e2e/bloqueo_biometria.yaml` |
| RF-17 | — | `web/src/lib/arranque.test.ts` (nuevo, marcas de tiempo) | `android/e2e/arranque_medicion.yaml` (medición) |
| RF-18 | `.../cola/ColaSincronizacionTest.kt` | `web/src/lib/captura/sincronizacion.test.ts`, `web/src/lib/idempotency.test.ts` (ya existe, 10 tests) | `android/e2e/sin_conexion.yaml` |
| RF-19 | — | `web/src/lib/*.test.ts` existentes (43 ficheros entre `web/src` y `web/worker`) | Portar `web/e2e/e2e.cjs`, `mfa.cjs`, `google-setup.cjs` a `android/e2e/` |
| RF-20 | `.../captura/CompartirIntentTest.kt` | `web/src/lib/bankNotice.test.ts` (ya cubre `readSharedNotice`, 5 tests) | `android/e2e/compartir.yaml` |
| RF-21 | — | `web/src/lib/google.test.ts` (existe; ampliar CA-21-1 a CA-21-3) | `android/e2e/google_nativo.yaml` |
| RF-22 | — | `web/src/lib/recovery.test.ts` (nuevo) | `android/e2e/recuperacion.yaml` |
| RF-23 | — | `web/src/lib/backup.test.ts` (ya existe) | `android/e2e/respaldo_compartir.yaml` |
| RF-24 | — | `web/src/lib/update.test.ts` (nuevo) | verificación en canal interno |
| RF-25 | — | `web/src/lib/smartNotify.test.ts` (nuevo, reglas de horario y tope diario con hora explícita) | — |
| RF-26 | — | `web/src/lib/register.test.ts` (ampliar) | `android/e2e/pegar_aviso.yaml` |
| RF-27 | `.../captura/EnlaceProfundoTest.kt` | `web/src/lib/enlace.test.ts` (nuevo) | `android/e2e/enlace_nido.yaml` |
| NFR-01 | `.../captura/NoFiltraTextoTest.kt` (cliente HTTP instrumentado) | `web/src/lib/security.test.ts` (ampliar) | `android/e2e/cierre_sesion_limpio.yaml` |
| NFR-02 | `.../captura/RendimientoParserTest.kt` (1.000 avisos) | — | medición en gama media |
| NFR-03 | — | — | `android/e2e/accesibilidad_talkback.yaml` (manual asistido) |
| NFR-04 | `.../captura/EstadoServicioTest.kt` | — | prueba de fabricante (manual, lista de equipos) |

Prueba de paridad obligatoria: el mismo `fixtures.json` lo ejecutan `ParserAvisoTest.kt` y `web/src/lib/__fixtures__/fixtures.test.ts`. Si uno cambia y el otro no, falla el build.

---

## 6. Definición de «Hecho» (Definition of Done)

Un requisito está **Hecho** cuando se cumplen todas estas condiciones:

1. Los criterios de aceptación (CA) del requisito tienen un test automático en la ruta de la sección 5, o una prueba manual con checklist firmado en `docs/mobile/`.
2. Cada test se vio **fallar** antes de escribir el código (registro de la salida en el commit o en la descripción del PR).
3. El código mínimo hace pasar los tests, y después se refactorizó sin romperlos.
4. `bash scripts/verificar.sh` pasa (lint, tsc, tests unitarios y pruebas SQL locales). Salida copiada literal, como exige AGENTS.md.
5. `npm --prefix web test` pasa, y `npm --prefix web exec -- tsc -b web` no marca errores.
6. Los tests Kotlin pasan (`./gradlew :app:testDebugUnitTest`; comando a confirmar cuando exista el proyecto Android, NO VERIFICADO).
7. Ningún test nuevo quedó roto: si un test falla dos veces, se simplifica o se borra y se reporta (AGENTS.md).
8. No se tocó producción, ni se hizo `git push`, ni `gh`, ni se leyó `.env*`, `.dev.vars` o `respaldo-*.sql` (AGENTS.md).
9. Ninguna migración de base se aplicó: solo se creó el archivo en `supabase/migrations/` y se probó en la base local.
10. Para RF que tocan privacidad (RF-01, RF-05, RF-10, NFR-01): revisión de seguridad del agente `auditor` (solo lectura).
11. El texto de la app está en español simple, sin jerga financiera (AGENTS.md).
12. El reporte final de la tarea dice lo que se corrió, con el resultado real, y lo que no se hizo.

### Ciclo TDD obligatorio

Para cada requisito, en este orden:

1. **Requisito**: tomar un ID (p. ej., RF-02) y un CA concreto.
2. **Escribir el test**: en la ruta de la sección 5. El test usa un fixture de la sección 3 o una fecha explícita (AGENTS.md: no mockear el reloj).
3. **Ver que FALLA**: ejecutar el test y registrar la salida. Si pasa sin código nuevo, el test no prueba nada: se reescribe.
4. **Código mínimo**: solo lo necesario para que ese test pase.
5. **Ver que PASA**: ejecutar el test y registrar la salida.
6. **Refactor**: limpiar sin cambiar el comportamiento; los tests siguen en verde.
7. **Repetir** con el siguiente CA. Cerrar el requisito cuando todos sus CA pasan y se cumple la Definición de Hecho.

Regla práctica: no se escribe código de captura (Kotlin) antes de que exista el test de su parser con los fixtures F01-F32 en rojo.

---

## 7. iOS: qué es posible y qué no

| Función | Android | iOS | Notas |
|---|---|---|---|
| Leer notificaciones de otras apps | Sí, con acceso concedido (`NotificationListenerService`) | **No** | iOS no permite a una app leer notificaciones de otras apps. No hay alternativa legítima para esto. |
| Captura automática desde compra con tarjeta | Sí (RF-01 a RF-09) | **Parcial** | Solo mediante Atajos (Shortcuts) con automatización al recibir una compra de Apple Pay (la automatización de «Transacción» de Wallet). Depende de que el banco y la tarjeta estén en Wallet (**NO VERIFICADO** qué bancos chilenos lo soportan). |
| Enlace de registro rápido | Sí (RF-27) | Sí | Atajo de Atajos que abre `nido://gasto?monto=..&comercio=..`. Es la vía principal de iOS. |
| App Intents / acciones de Siri | Sin equivalente | Sí | Permite «registrar un gasto de X en Y» por voz; requiere desarrollo nativo con App Intents (**NO VERIFICADO** el alcance exacto en la versión vigente). |
| Notificaciones push a la pareja | Sí (FCM, RF-10) | Sí (APNs, con FCM como puente) | Requiere cuenta de desarrollador de Apple (pago anual; NO VERIFICADO el costo vigente). |
| Widgets | Sí | Sí | Fuera de alcance: la migración `20261029120000_elimina_widgets.sql` eliminó los widgets web. |
| Bloqueo con Face ID / Touch ID | Sí (RF-16) | Sí | Mismo plugin, distinto proveedor. |
| Cola sin conexión (RF-18) | Sí | Sí | Mismo diseño, almacén seguro del sistema. |
| Instalación desde el navegador | No aplica | No aplica | Se entrega por la tienda en ambos casos. |

Conclusión para iOS: la captura automática sin acción de la persona **no es posible**; la captura queda en Atajos de Apple Pay y en el enlace `nido://`. El producto debe presentar esto como una limitación de la plataforma, no como una falla.

---

## 8. Hallazgos clave (solo web y riesgos)

1. `web/src/lib/supabase.ts` depende de `/supabase` del mismo origen (Worker o proxy de Vite). Una WebView de Capacitor no tiene ese origen. Es la decisión DEC-01 y bloquea todo lo demás.
2. La sesión vive en `localStorage` con la clave `contigo-auth` (`web/src/lib/supabase.ts`). Hay que migrarla a almacenamiento seguro (DEC-03).
3. El inicio de sesión con Google usa redirección (`web/src/lib/oauth.ts`). Hay que cambiarlo por token nativo (DEC-02); la función `signInWithGoogleToken` ya existe en `web/src/lib/google.ts`.
4. El push depende de `PushManager` y VAPID (`web/src/lib/push.ts`) y de `push_subscriptions` con columnas de Web Push. Hace falta una migración nueva y un emisor FCM (DEC-04).
5. `categorize.ts` ya aprende comercio→categoría del historial, así que no se necesita una tabla de reglas nueva (RF-08).
6. `bankNotice.ts` ya parsea montos CLP y comercios, pero **no detecta OTP, promociones ni saldos** (RF-03). Según la lectura de código, un OTP con monto o un saldo se leerían como gasto. NO VERIFICADO por ejecución.
7. No hay cola sin conexión: `trackedFetch.ts` no reintenta escrituras y `OfflineBar.tsx` lo advierte. `idempotency.ts` ya trae el identificador que hace seguro el reintento (RF-18).
8. `web/src/screens/Shell.tsx` está vacío (0 bytes). Eliminar en la rama nativa.
9. `web/src/lib/wipe.ts` borra las claves `contigo-*` al cerrar sesión, pero no conoce el almacén seguro ni la cola nativa: hay que extenderlo (RF-19).
10. La app actual ya tiene un flujo de «compartir aviso» desde Android (`web/vite.config.ts`, `share_target`) y un widget para KWGT que ya no existe (`supabase/migrations/20261029120000_elimina_widgets.sql`).
11. El repo no tiene código Android, Capacitor ni Firebase (búsqueda en todo el árbol, sin resultados fuera de comentarios y de la documentación de proveedores).
12. Hay 43 ficheros de test entre `web/src` y `web/worker`. Los tests de RF-10 (`push.ts`) y de RF-25 (`smartNotify.ts`) no existen todavía.
13. Riesgo de Turnstile (`web/src/lib/captcha.ts`) dentro de WebView: NO VERIFICADO.
14. El cliente web depende de un Worker con límites por IP (`web/wrangler.jsonc`, `RL_AUTH`, `RL_WRITE`). La decisión DEC-01 afecta a esos límites.

## 9. Preguntas abiertas para el humano

1. DEC-01: ¿la app nativa pasa por el Worker o llama a Supabase directo?
2. Versión mínima de Android (SUP-01).
3. Cuotas (F04): ¿se registra la cuota o el total?
4. Modo automático: ¿se permite por defecto o es opcional? ¿Qué límite de monto?
5. Conflictos sin conexión (CA-18-6): ¿último en llegar gana o se pide revisar?
6. Política de la tienda para el acceso a notificaciones (DEC-05): revisar antes de comprometer el alcance.
7. Ocultar montos en la pantalla de bloqueo: ¿activado por defecto?
