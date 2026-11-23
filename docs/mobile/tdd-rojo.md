<!-- Copyright (c) 2026 Dinovance -->
# TDD fase ROJA: tests escritos y vistos fallar (2026-11-21)

Todo corrido en local, sin red hacia producción. Los tests fallan por aserción o por `no implementado` (stubs), no por errores de import ni de compilación (`tsc -b` limpio, Gradle compila).

## Resultado verificado
- Kotlin (`gradle -p native/parser test`): 63 tests, 61 fallan (`NotImplementedError`), 2 pasan (guardas: los 47 fixtures están completos y ParsedCandidate expone solo los campos del contrato).
- Vitest (`npm --prefix web test`): 666 tests, 176 fallan, 490 pasan. De los 490, 486 son los previos del repo (siguen en verde) y 4 son guardas nuevas que ya pasan (ver abajo).
- `npm --prefix web exec -- tsc -b web`: sin errores. oxlint: solo las advertencias que ya existían.

## Requisito → test → estado
| Requisito | Archivo de test | Tests | Estado |
|---|---|---|---|
| RF-02, RF-03 (fixtures F01-F32 + E01-E15) | `native/parser/src/test/kotlin/cl/nido/parser/NotificationParserFixturesTest.kt` | 48 (47 parametrizados + 1 guarda) | 47 ROJO, 1 verde (guarda) |
| RF-04 huella / deduplicación | `.../FingerprintTest.kt` | 8 | ROJO verificado |
| RF-01 lista blanca | `.../WhitelistTest.kt` | 5 | ROJO verificado |
| NFR-01 sin texto bruto | `.../NoRawTextTest.kt` | 2 | 1 ROJO, 1 verde (guarda de campos) |
| RF-03 en TS (OTP con monto, saldo, promoción, rechazada, pago de deuda) | `web/src/lib/bankNotice.test.ts` (ampliado) | 10 nuevos | 9 ROJO, 1 verde (no sobre-filtrar) |
| DEC-01 baseUrl, sin Origin | `web/src/lib/nativeApi.test.ts` | 9 | 8 ROJO, 1 verde (constante `/supabase`) |
| DEC-03 sesión segura | `web/src/lib/secureSession.test.ts` | 7 | 6 ROJO, 1 verde (el módulo stub no usa localStorage) |
| RF-07, RF-08, RF-09 candidatos y modo automático | `web/src/lib/candidates.test.ts` | 19 | ROJO verificado |
| RF-18 cola sin conexión | `web/src/lib/offlineQueue.test.ts` | 14 | ROJO verificado |
| RF-27 enlace profundo | `web/src/lib/deepLink.test.ts` | 21 | ROJO verificado |
| Decisión 5 / RF-06 privacidad de bloqueo | `web/src/lib/lockPrivacy.test.ts` | 6 | ROJO verificado |
| Estándares: errores tipados | `web/src/lib/appError.test.ts` | 24 | ROJO verificado |
| Estándares: toasts | `web/src/lib/toastQueue.test.ts` | 13 | ROJO verificado |
| Estándares: pantallas de error y vacío | `web/src/lib/screenState.test.ts` | 18 | ROJO verificado |
| Estándares: eventos y alertas de seguridad | `web/src/lib/securityEvents.test.ts` | 19 | ROJO verificado |
| Estándares: licencias, SBOM y copyright | `web/src/lib/licenses.test.ts` | 12 | ROJO verificado |
| Estándares: sin secretos / console.log / localStorage | `web/src/lib/codeHygiene.test.ts` | 8 | 7 ROJO, 1 verde (hay archivos que revisar) |

## Decisiones de diseño de QA que los desarrolladores deben respetar o discutir
- Kotlin: `NotificationParser` es una clase con la lista blanca en el constructor: `NotificationParser(allowedPackages: Set<String>).parse(...)` (el contrato de decisiones.md no decía cómo llega la lista). Paquete: `cl.nido.parser`. La huella usa paquete + texto normalizado + monto + minuto del aviso; es hex de 32+ caracteres.
- Retiro (F25): `Kind.EXPENSE` con `Confidence.LOW`; sin comercio: `MEDIUM`. Abonos y devoluciones: `INCOME`, el comercio no se exige. Pago de cuota de deuda (F05) y cualquier OTP, promoción, saldo o compra rechazada: `null`. Monto >= 10.000.000.000 o 0: `null`.
- TS `candidates`: `ParsedCandidate` agrega `postedAtMillis`; la fecha `spent_on` es la local del aviso. Modo automático con límite inclusivo (`<=`), sin comercio o sin categoría aprendida del historial (la lista fija `KNOWN` no cuenta) pide confirmación.
- `appError`: 503 = MAINTENANCE, 504 y 408 = TIMEOUT, 500 y 502 = SERVER, 401 con «JWT expired» = SESSION_EXPIRED.
- `securityEvents`: ventana de 10 minutos; fuerza bruta >= 5 fallos por usuario (>= 20 critical); relleno >= 10 cuentas desde una IP; MFA >= 3 fallos.
- Límitaciones: la reutilización de `trackedFetch` por la petición nativa NO se pudo probar sin mockear `navigator`/`fetch` globales (prohibido por AGENTS.md); queda como NO VERIFICADO, se sugiere que el dev exponga `createTrackedFetch(base)`. La detección de secretos por regex no garantiza encontrarlos todos.
- `codeHygiene.test.ts` revisa los módulos TS nuevos listados en el test, todo `native/**` (sin tests ni build) y `web/src/native/**`. Exige encabezado «Copyright (c) 2026 Dinovance» en cada uno: los desarrolladores deben añadirlo (y los stubs lo perderán al reemplazarse).
- `licenses.test.ts` lee `web/package-lock.json`; si aparece una licencia no permitida lo dirá con nombre y versión.

## Stubs creados (todos marcados `TODO-TDD-STUB`; el dev los reemplaza)
- Kotlin: `native/parser/src/main/kotlin/cl/nido/parser/NotificationParser.kt` (lanza `NotImplementedError`).
- TS en `web/src/lib/`: `nativeApi.ts`, `secureSession.ts`, `candidates.ts` (constante `DEFAULT_CAPTURE_SETTINGS` con valor incorrecto a propósito), `offlineQueue.ts`, `deepLink.ts`, `lockPrivacy.ts` (`DEFAULT_HIDE_ON_LOCK_SCREEN` incorrecta a propósito), `appError.ts`, `toastQueue.ts`, `screenState.ts`, `securityEvents.ts`, `licenses.ts`, `codeScan.ts`.
- Estructura Gradle de pruebas: `native/parser/settings.gradle.kts`, `build.gradle.kts` (Kotlin 2.0.21, JUnit 5.11.3, kotlinx-serialization-json 1.7.3), `.gitignore`. Fixtures: `native/parser/src/test/resources/fixtures.json` (47 casos, todos `"sintetico": true`).
- No se tocó código de producción existente ni `web/android`. Se agregó `/// <reference types="node" />` a 3 tests que leen archivos.

## Cómo ejecutar
- Kotlin: `source ~/.config/mobile-env.sh && gradle -p native/parser test`
- TS: `npm --prefix web test` · tipos: `npm --prefix web exec -- tsc -b web`
- Contenedor: `bash scripts/docker-test.sh` (no se ejecutó en esta tarea; se usó el host).
