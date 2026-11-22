<!-- Copyright (c) 2026 Dinovance -->
# Auditoría independiente (solo lectura) · 2026-11-21

Agente AUDITORÍA. Rama `feat/android-ios`, worktree `/home/jromero/proyectos/nido-mobile`. Sin ediciones de código ni de docs existentes. Único archivo escrito: este.

Estado del repo al auditar: al inicio había ~50 archivos modificados o sin seguir. Entre las 19:00 y las 19:01 apareció el commit `4b72dfa` (autor Tufavo1, 19:00:58) y el árbol quedó limpio. No fue creado por esta auditoría. Todas las verificaciones de abajo se hicieron sobre `HEAD = 4b72dfa`.

## Tabla de controles

| # | Control | Resultado | Evidencia |
|---|---|---|---|
| 1a | `web/worker` no modificado frente a `origin/main` | PASA | `git diff origin/main HEAD -- web/worker` vacío; `git status --short -- web/worker` vacío. |
| 1b | Sin commits ni pushes de agentes | NO VERIFICADO | `git log origin/main..HEAD` = 1 commit (4b72dfa, Tufavo1). El reflog local no registra pushes (esos quedan en el remoto). Autoría del commit fuera de esta auditoría. |
| 1c | Sin referencias ejecutables a producción en el código nuevo | PASA con notas | Grep de `contigo.dinovance.cl`, `supabase.co`, `wrangler`, `db push`, `--linked`, `--remote`, `SUPABASE_DB_URL`, `curl`, `wget`, `git push` sobre los 331 archivos del commit: solo aparecen en docs (prohibiciones o instrucciones para el humano), en `deploy.yml` (no nuevo), en `opencode.json` (deny) y en `supabase/functions/notify/index.ts` (CORS, no ejecutable contra producción). `docs/mobile/release.md` tiene `gh release create` como instrucción humana. `docker-compose.mobile.yml` y `scripts/docker-*.sh` no contienen referencias de nube. |
| 2a | Sin secretos en el árbol versionable | PASA | `git ls-files` + grep de JWT `eyJ…`, `PRIVATE KEY`, `AKIA`, `AIza`, `sb_secret_`, `sk_live`, URL de Postgres con clave. Única coincidencia real: `web/src/lib/codeHygiene.test.ts` (fixtures de prueba del detector: `AKIAABCDEFGHIJKLMNOP`, PEM de una línea, JWT de ejemplo `firmaDeEjemplo`). `scripts/backup.sh:5` usa placeholders `<clave>`. `service_role` aparece en docs y migraciones previas (texto, no clave). |
| 2b | `.env*`, llaves y respaldos ignorados | PASA con excepción | `git check-ignore`: `.env`, `.dev.vars`, `keystore.properties`, `*.jks` ignorados. `~/.nido-signing/` (700) con `keystore.properties` (600, 174 B) y `nido-release.jks` (600, 4276 B), solo `stat`. Excepción: `web/.env.production.example` está rastreado (no leído, por regla). |
| 2c | Ningún `.jks/.pem/.p12/.key/.env` en el árbol | PASA | `git ls-files \| grep -E '\.(jks|keystore|pem|p12|pfx|key)$|\.env|\.dev\.vars|respaldo-'` solo devuelve `web/.env.production.example`. |
| 3a | Pruebas JVM (`native/core`) | PASA (resultados existentes, no re-ejecutado) | `native/core/build/test-results/jvmTest/*.xml` (19:00): 9 suites, 125 tests, 0 fallos, 0 errores. |
| 3b | Vitest web | PASA (ejecutado) | `npm --prefix web test -- --run`: 79 archivos, 826 tests pasan, 0 fallos. |
| 3c | Gradle app (`web/android`) | PASA (resultados existentes) | `web/android/app/build/test-results` (18:59): 7 XML, 43 tests, 0 fallos. |
| 3d | APK y firma | PASA | `sha256sum -c` de `dist-apk/nido-debug.apk` y `nido-release.apk`: "La suma coincide". `apksigner verify --verbose` (release): v2 = true, v1 = false, v3 = false. Sin RSA en META-INF; firma solo v2. |
| 3e | Docs con estado «abierto/verde» contradictorio | FALLA | Ver discrepancias D1 a D4. |
| 4a | Texto bruto de notificaciones no sale del teléfono | PASA con nota | `NoRawTextTest` (jvm) comprueba que el resultado no contiene el aviso ni su título. `ParsedCandidate` solo expone `amountClp, merchant, kind, confidence, installment, fingerprint`. Kotlin sin ninguna llamada de red (grep `HttpURLConnection|OkHttp|java.net|URL(|Socket` sin resultados). Nota en D6. |
| 4b | Telemetría y logs sin datos sensibles | PASA | `clientReport.ts` solo envía código tipado, versión, pantalla (regex), correlación y pila saneada. `safeLog.ts` imprime solo el tipo de error. Sin `console.log` en `web/src`. Solo 2 `console.error`: `safeLog.ts:47` y `wipe.ts:27`, ambos con el tipo de error. |
| 4c | Manifiesto y build | PASA | Manifiesto: `allowBackup="false"`, `usesCleartextTraffic="false"`, `dataExtractionRules`, `networkSecurityConfig` (cleartext false, solo CAs del sistema). `build.gradle` release: `debuggable false`, `minifyEnabled true`. |
| 5 | Incidente Docker (heredocs rechazados y reintentados en trozos) | NO VERIFICADO | No hay registro del incidente en el repo ni en `nido-selfhost` (grep de heredoc, trozo, rechaz, chequeo: solo aparecen textos normales). Ver hallazgo H5 para las señales relacionadas. |
| 6a | Contenedores de `nido-selfhost` | PASA | `docker ps` (solo lectura): 14 contenedores `nido-selfhost-*` Up 3 h, healthy donde aplica. Contenedores ajenos `supabase_*_nido` y `supabase_*_dinovance-gym` Up 4 h; no hay señal de reinicio ni alteración en la ventana visible. |
| 6b | Puertos de `nido-selfhost` solo en 127.0.0.1 | PASA | `docker ps` y `ss -ltn`: 55321, 55322, 55324, 55330, 55332 y 55340/udp solo en 127.0.0.1. Loki, Prometheus, sec-ingest y gateway interno sin puertos publicados. `cloudflared` (profile `tunnel`) no está levantado. |
| 6c | Puertos de stacks Supabase ajenos | FALLA (fuera del alcance de nido) | `supabase_kong_nido` 54321, `supabase_db_nido` 54322, `supabase_studio_nido` 54323, etc., y los de `dinovance-gym` (54421 a 54424) publicados en `0.0.0.0` (ss: `0.0.0.0:5432x`). La base local queda visible desde la red. No se tocó nada. |
| 7a | Cabecera de copyright en archivos nuevos | FALLA parcial | Archivos del commit con extensión de código, SQL o script: 155 con `Copyright (c) 2026 Dinovance` en las primeras 5 líneas y 54 sin ella (incluye `web/ios/*.swift`, `web/android/gradlew`, tests `*.test.ts`). Método distinto al de S-14 (ver D5). |
| 7b | Licencias y avisos de terceros | NO VERIFICADO (parcial) | Existe `web/src/lib/licenses.ts` (SBOM con licencia, rechazo de incompatibles y aviso de terceros) y `LicensesCard.tsx`. No hay `LICENSE`, `NOTICE` ni `THIRD_PARTY` en el árbol versionable (`git ls-files`). No se revisó el contenido del inventario contra `package-lock`. |

## Hallazgos

- **H1 (producto, requiere decisión).** `supabase/functions/notify/index.ts` (líneas 128 a 140 aprox.) arma el push nativo con `title = "<nombre> registró un gasto"` y `body = "<monto> en <categoría>"`, y lo envía a Google FCM (`fcm.ts`). El monto y el nombre de categoría salen del servidor hacia FCM. No es texto bruto de notificaciones, pero sí contradice la idea de no enviar montos a terceros. Se necesita decisión del dueño.
- **H2 (producto).** Al confirmar un gasto, el comercio y el monto se insertan en `expenses` (`expenseQueue.ts`, `saveExpense.ts`). Es el flujo previsto, no una fuga, pero conviene dejarlo escrito en la política de privacidad.
- **H3 (repo).** `opencode.json` tiene 63 reglas `deny` por patrón de subcadena (p. ej. `*cloudflare*`, `*dinovance.cl*`, `*gh *`, `*curl *`, `*rm -rf*`, `*--remote*`). Se aplican sobre el comando completo, así que también casan con texto dentro de heredocs o de documentos.
- **H4 (infra, ajeno a nido).** Stacks Supabase locales `supabase_*_nido` y `*_dinovance-gym` escuchan en `0.0.0.0`. La base de desarrollo es alcanzable desde la red local.
- **H5 (incidente, sin verificar).** Señales en el repo, reportadas tal cual y sin suponer intención: (a) no hay `docker.sock`, ni `privileged`, ni `cap_add`, ni `network_mode: host`; el compose de nido-mobile usa `cap_drop: [ALL]`, `no-new-privileges`, usuario 1000 y sin puertos; (b) `docs/mobile/observabilidad-infra.md` documenta explícitamente que se evitó `docker.sock`; (c) el build monta el repo con escritura (`.:/work:z`) y la imagen no está fijada por digest (S-13 de `seguridad.md`); (d) los reintentos por trozos no dejan rastro en el repo. No se puede saber si los rechazos vinieron de `opencode.json` ni cuál fue el propósito del reintento.
- **H6 (notas de producto).** `seguridad.md` S-15 reconoce que otra app con acceso a notificaciones puede leer los avisos. Pendiente y declarado.

## Discrepancias

- **D1. `qa-ronda2.md` (18:53) desactualizado.** Reporta `jvmTest` 125 tests con 9 fallos, `:app:testDebugUnitTest` 43 con 4 fallos y `npm test` 825 con 5 fallos. Los resultados actuales (18:59 a 19:00 y vitest ahora) dan 0 fallos en las tres suites. `backend-android.md` (18:56) declara «Fase VERDE», pero no hay ninguna nota de re-ejecución en `qa-ronda2.md`.
- **D2. R9 y R10 sin cierre.** `qa-ronda2.md` dice `e2e-ronda2.sh`: 2 FALLA (R9, R10). `backend-android.md` no menciona R9 ni R10. No verificado: la prueba requiere `docker exec` contra staging, que esta auditoría no ejecuta.
- **D3. `qa-integracion.md` obsoleto.** 115 tests con 23 fallos, anterior a la ronda 2. No se marca como histórico.
- **D4. `docker.md` obsoleto.** Dice vitest «43 archivos, 486 tests» y Kotlin «PENDIENTE». Hoy: 79 archivos, 826 tests y 125 tests JVM. Dice también «No se ejecutó up de nada de nido-selfhost», pero `observabilidad-infra.md` y `docker ps` muestran el stack de observabilidad levantado.
- **D5. Conteo de cabeceras.** `seguridad.md` S-14 dice «63 de 194 archivos nuevos sin cabecera». Esta auditoría cuenta 54 de 209 (código, SQL y scripts). Las cifras no coinciden por diferencia de alcance. Ninguna de las dos está verificada con el mismo criterio.
- **D6. Ambigüedad en `requisitos.md` (punto 7 del estado de partida).** Dice «No hay cola sin conexión», pero `web/src/lib/expenseQueue.ts` existe y `frontend.md` describe la cola. Es un estado de partida, no el actual; conviene marcarlo como histórico.
- **D7. Atribución del commit `4b72dfa`.** Su trailer es `Co-Authored-By: Claude Sonnet 5.5`. La atribución vigente para commits de agentes es `Claude Haiku 5.5`. No lo creó esta auditoría, así que solo se registra.

## Lo que no se hizo

No se leyó ningún `.env*`, `.dev.vars`, respaldo ni el keystore. No hubo `git push`, `gh`, `wrangler`, `supabase` contra remoto, `sudo`, ni `docker` más allá de `docker ps` (solo lectura). No se contactó `contigo.dinovance.cl` ni `*.supabase.co`. No se re-ejecutaron las pruebas JVM ni Gradle; se usaron sus resultados guardados. No se ejecutaron e2e de staging (requieren `docker exec`).
