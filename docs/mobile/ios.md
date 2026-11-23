<!-- Copyright (c) 2026 Dinovance -->
# iOS (Contigo) — estado real

Rama `feat/android-ios`. Todo lo de iOS se escribió en Linux, **sin Xcode**: nada se compiló ni se ejecutó. Lo verificado y lo no verificado va por separado.

## Lo que SÍ se verificó (por otros medios)
- `npx cap add ios` (Capacitor 8.6.2) generó `web/ios/` sin errores (usa Swift Package Manager, no CocoaPods: **no hace falta `pod install`**). Quedó con el mismo `appId` `cl.dinovance.contigo` y nombre `Contigo`, y detectó 7 plugins (app, haptics, keyboard, network, push-notifications, splash-screen, status-bar).
- `Info.plist` y `App.entitlements` son XML válido (`xmllint`).
- `project.pbxproj`: llaves y paréntesis balanceados y todos los identificadores usados están definidos (script propio). Esto NO prueba que Xcode lo abra.
- No se pudo revisar la sintaxis de Swift (no hay `swiftc` en este equipo).

## Qué hay (todo NO PROBADO)
| Archivo | Contenido |
|---|---|
| `web/ios/App/App/Info.plist` | Esquema `nido://`; idioma `es`; ATS estricto (`NSAllowsArbitraryLoads=false`, sin red local); iPhone solo vertical; `NSFaceIDUsageDescription` en español (RF-16); `arm64`; `ITSAppUsesNonExemptEncryption=false` (el dueño debe confirmarlo: solo usamos HTTPS estándar). Sin cámara, micrófono, ubicación ni contactos. |
| `web/ios/App/App/App.entitlements` | `aps-environment` (push) y grupo de Keychain propio. Sin iCloud. |
| `web/ios/App/ContigoCore/` | Paquete Swift sin Capacitor: `ExpenseLinkParser` (valida `nido://gasto`), `ClpAmount` (importes), `KeychainStore`, `PendingExpenseStore`. |
| `web/ios/App/App/ContigoPlugin.swift` | Plugin Capacitor `ContigoNative`: `secureGet/Set/Remove/Clear`, `validateExpenseLink`, `takePendingExpense` y eventos `expenseLink` / `expenseLinkRejected`. |
| `web/ios/App/App/ContigoBridgeViewController.swift` | Registra el plugin (los plugins locales no se autodescubren). `SceneDelegate` lo usa. |
| `web/ios/App/App/RegistrarGastoIntent.swift` | App Intent / Atajo «Registrar gasto en Contigo» (monto y comercio), iOS 16+, abre la app. |
| `AppDelegate.swift`, `SceneDelegate.swift` | Reenvío del token APNs a `@capacitor/push-notifications`; velo difuminado al ir a segundo plano (oculta montos en recientes). |
| `ContigoCore/Tests/ContigoCoreTests/*` | Pruebas XCTest escritas antes que el código. **NO EJECUTADAS (requieren Xcode).** |

Se editó `project.pbxproj` a mano (archivos nuevos, entitlements, paquete local `ContigoCore`). Si Xcode se queja, agregue los archivos con «Add Files to App» y el paquete con «Add Local…».

## Seguridad aplicada
- Keychain: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, `kSecAttrSynchronizable=false` (no iCloud, no copias a otro aparato). Valor máx. 64 KiB, clave máx. 128. Los errores no incluyen claves ni valores; no hay `print`/logs.
- Enlace `nido://gasto?monto=..&comercio=..&fecha=..` (mismo contrato que `web/src/lib/deepLink.ts`): rechaza esquemas ajenos, otras acciones, usuario/puerto/ruta extra, monto que no sea entero positivo en dígitos (máx. 9.999.999.999), parámetros repetidos, comercio con caracteres de control/formato o de más de 60 caracteres. Fecha inexistente o futura se descarta (queda «hoy»), igual que RF-02.
- El borrador validado vive solo en memoria y nunca se guarda solo: abre Confirmar gasto y la persona confirma (RF-27, CA-27-3 sin sesión lo resuelve el front).
- Aviso al front-end: la app recibe el enlace por dos vías (evento `appUrlOpen` de `@capacitor/app` y evento `expenseLink` del plugin). Debe usar **una sola** para no abrir dos borradores.

## Contrato JS del plugin (a implementar en `web/src`, el front-end lo usa por interfaz TS)
`registerPlugin('ContigoNative')`: `secureGet({key}) -> {value?}`, `secureSet({key,value})`, `secureRemove({key})`, `secureClear()`, `validateExpenseLink({url}) -> {ok, amountClp?, merchant?, date?, reason?}`, `takePendingExpense() -> {amountClp?, merchant?, date?}`; eventos `expenseLink` ({amountClp, merchant?, date?}) y `expenseLinkRejected` ({reason}). No coincide necesariamente con el plugin Android: hay que alinear nombres con ese agente.

## Lo que iOS NO puede hacer
**iOS no permite a una app leer las notificaciones de otras apps** (no existe equivalente a `NotificationListenerService`). No hay vía legítima. Por eso la captura automática desde avisos del banco (RF-01..RF-09) **no existe en iOS**. Alternativas:
1. Atajo de Apple con automatización «Transacción» de Wallet que llama a la acción «Registrar gasto en Contigo» (o abre `nido://gasto?...`). Solo funciona con tarjetas agregadas a Apple Pay/Wallet; qué bancos chilenos lo soportan y en qué forma entrega el monto Wallet: **NO VERIFICADO**. Las automatizaciones de Wallet pueden pedir confirmación según la versión de iOS (**NO VERIFICADO**).
2. Enlace `nido://` desde cualquier Atajo, y Siri por voz con el mismo intent.
3. Pegado manual (como hoy).

## Diferencias frente a Android
- Sin captura de notificaciones ni «modo automático» (ese modo depende de ellas).
- Push: APNs en vez de solo FCM (con FCM como puente solo si se decide; requiere `GoogleService-Info.plist` y no está integrado).
- Keychain en vez de Keystore; Face ID en vez de BiometricPrompt (el plugin de biometría aún no existe en iOS: **pendiente**).
- Sin permiso especial de notificaciones; el permiso de push lo pide la app en tiempo de ejecución.

## Pasos para el dueño en un Mac
1. Instalar Xcode (versión actual de la App Store; mínimo exigido por Capacitor 8: **NO VERIFICADO**, vea la guía oficial) y abrirlo una vez para aceptar licencias.
2. En el repo: `cd web && npm ci && npm run build && npx cap sync ios`. (Capacitor 8 usa SPM; si el proyecto usara CocoaPods, además `cd ios/App && pod install`, y se abre el `.xcworkspace`.)
3. `npx cap open ios` (abre `ios/App/App.xcodeproj`). Espere a que Xcode resuelva los paquetes (incluye `ContigoCore`).
4. Pruebas: abrir `web/ios/App/ContigoCore` y correr `swift test`, o en Xcode menú Product > Test sobre el paquete. Debe pasar todo; si algo falla, es un hallazgo real (nunca se ejecutaron).
5. Target `App` > Signing & Capabilities: elegir su **Team** de Apple Developer; confirmar que aparecen Push Notifications y Keychain Sharing; si `cl.dinovance.contigo` ya está tomado, cambie el Bundle Identifier (y el `appId` de `capacitor.config.ts`).
6. Conectar un iPhone (modo desarrollador activado), elegirlo como destino y Run. Probar: abrir `nido://gasto?monto=4500&comercio=Cafe%20Demo` desde Safari; crear el Atajo «Registrar gasto en Contigo»; iniciar sesión y cerrar la app (la sesión debe leerse desde Keychain).
7. TestFlight: Product > Archive > Distribute App > App Store Connect > TestFlight; crear el registro de la app en App Store Connect con el mismo Bundle ID; agregar probadores.

## Qué necesita de Apple
- Cuenta del **Apple Developer Program** (de pago anual; monto vigente **NO VERIFICADO**). Sin ella solo hay instalación de prueba de 7 días en su propio aparato y no hay push ni TestFlight.
- Clave de autenticación **APNs (.p8)** o certificado de push, con su Key ID y Team ID, para el emisor de `supabase/functions/notify` (el emisor APNs no está hecho).
- `GoogleService-Info.plist` **solo si** se usa FCM en iOS (no está en el repo ni se creó). Los secretos nunca van al repositorio.
- Ícono y splash: son los de plantilla de Capacitor; falta el ícono definitivo 1024x1024.

## Riesgos y pendientes
- Todo el código Swift y el `.pbxproj` editado a mano: **NO PROBADO**; pueden fallar la compilación o el enlace del paquete.
- `AppShortcutsProvider`, `@Parameter` opcional en `parameterSummary` y `openAppWhenRun` dependen de iOS 16+; en iOS 15 (destino mínimo actual) el Atajo no existe, solo el enlace `nido://` (**NO PROBADO**).
- Si la app se abre en frío por el Atajo, el evento se retiene (`retainUntilConsumed`) hasta que JS escuche; sin probar.
- Si el front usa dos vías para el enlace, habrá borradores duplicados (ver arriba).
- `aps-environment=development`: el cambio a producción lo hace Xcode al archivar con firma automática (**NO VERIFICADO**).
- Políticas de App Store (revisión por manejar datos financieros, política de privacidad, «Privacy Manifest» / etiquetas de privacidad): sin revisar.
- Biometría, sesión en Keychain para supabase-js, cola sin conexión y push en iOS: el front y el plugin aún no están conectados de punta a punta.
