<!-- Copyright (c) 2026 Dinovance -->
# Núcleo Kotlin Multiplatform (`native/core`) · DEC-06 · 2026-11-21

La interfaz sigue siendo el React con Capacitor. Solo la lógica pura compartida vive en `native/core`; reemplaza a `native/parser` (borrado cuando todo pasó).

## Contenido (paquete `cl.nido.parser`, sin cambio de nombre)
`commonMain`, sin ningún `java.*`: `NotificationParser`, `DiscardRules`, `MoneyExtractor`, `ClpAmount` (parseo, límite y formato de pesos), `InstallmentExtractor`, `MovementClassifier`, `MerchantExtractor`, `Fingerprint` + `Sha256` (SHA-256 en Kotlin puro), `TextNormalizer` (tildes a mano, sin `java.text.Normalizer`), `ParsedCandidate`, `ExpenseLinkParser` (validación de `nido://gasto`) y `AutoCaptureRules` (modo automático, el que decide si hay categoría aprendida pasa como booleano).
`jvmTest`: las 65 pruebas de QA y de robustez, sin tocar aserciones (leen `fixtures.json`). `commonTest` (`kotlin.test`): SHA-256 con vectores conocidos, `ClpAmount`, normalización, enlace profundo y reglas del modo automático (7 pruebas).

## Objetivos y toolchain
- `jvm` (JVM 17, compilado con JDK 21): lo consume Android como build incluido `cl.nido:core` (`web/android/settings.gradle`).
- iOS (`iosArm64`, `iosSimulatorArm64`, `iosX64`): **solo se declaran en macOS** (`build.gradle.kts`). Comprobado: con los tres declarados en Linux, Gradle **descargó el compilador de Kotlin/Native (~400 MB) a `~/.konan`** aunque `kotlin.native.ignoreDisabledTargets=true` estaba puesto; por eso la declaración quedó condicionada al sistema operativo y se borró lo descargado. Con la condición, `gradle jvmTest` en Linux no descarga nada (`~/.konan` no existe).

## Una sola validación del enlace profundo
Android: `DeepLinkGuard` (usado en `MainActivity.onCreate` y `onNewIntent`) llama a `ExpenseLinkParser` y quita del intent cualquier `nido://` inválido antes de que llegue a la WebView. TypeScript (`deepLink.ts`) se conserva como segunda capa y para pruebas de UI; sigue con sus 21 pruebas. Swift: pendiente de que el agente de iOS use el núcleo.

## Cómo lo consumiría iOS (NO PROBADO: requiere un Mac con Xcode)
1. En un Mac, quitar nada: `build.gradle.kts` ya declara los tres destinos.
2. Añadir en `kotlin { ... }` el binario: `listOf(iosArm64(), iosSimulatorArm64(), iosX64()).forEach { it.binaries.framework { baseName = "NidoCore" } }` y generar `./gradlew :assembleNidoCoreXCFramework` (hay que añadir `val xcf = XCFramework("NidoCore")` y `xcf.add(framework)`).
3. Arrastrar `NidoCore.xcframework` a `web/ios/App` (Embed & Sign) y, desde el plugin Capacitor en Swift: `ExpenseLinkParser.shared.parse(url:todayYear:todayMonth:todayDay:)`, `NotificationParser` no aplica a iOS (no hay acceso a notificaciones de otras apps); sí `ClpAmount` y `AutoCaptureRules`.
4. Riesgos conocidos sin probar: el motor de `Regex` de Kotlin/Native (se usan `\b`, `(?:`, `(?!`), y `Long.floorDiv` / `String.encodeToByteArray` en common. Las pruebas de `commonTest` deberían correrse con `gradle iosSimulatorArm64Test` en el Mac.

## Contrato del plugin para el front-end (`web/src/lib/nativeBridge.ts`)
- `getRecentNotifyingApps(): {apps:[{packageName,label,lastSeenMillis}]}`: el servicio anota paquete y hora de cada aviso (sin leer texto ni extras) y se guarda como máximo una vez por minuto por app; 30 apps. El nombre visible sale de `getApplicationLabel` con visibilidad por `<queries>` de apps con icono (sin `QUERY_ALL_PACKAGES`); si el sistema no lo da, el nombre es el paquete.
- `getAllowedPackages()` / `setAllowedPackages({packages})` (antes `getWhitelist/setWhitelist`; nadie las usaba aún).
- `clearCaptured()`: borra borradores, notificaciones propias y la lista de apps recientes. `wipe()` hace lo mismo y además vacía la sesión.
- `readRecentApps` valida lo que llega del plugin y lo ordena por más reciente.

## NO VERIFICADO
Todo lo de iOS (compilación, XCFramework, Regex en Native); la lista de apps recientes y el nombre visible en un teléfono real; que `getApplicationLabel` resuelva con `<queries>` en todos los fabricantes.
