<!-- Copyright (c) 2026 Dinovance -->
# Decisiones para los agentes (2026-11-21)

El dueño del proyecto no estaba disponible; la sesión principal fijó estos valores por defecto para las preguntas abiertas de `requisitos.md` §9 y las DEC-01..05. Son reversibles: si el dueño decide otra cosa, se cambian aquí y en el código.

## Decisiones técnicas
- **DEC-01 (cómo llega la app a Supabase) — REVISADA:** la app nativa pasa por el mismo Worker `/supabase/*` (conserva los límites RL_AUTH/RL_WRITE). El Worker NO se toca y su regla (`isSameSite`) se mantiene: toda escritura debe llevar `Origin` igual al del propio Worker y `Sec-Fetch-Site` ausente o `same-origin`. Por eso TODAS las peticiones nativas (WebView con `CapacitorHttp` y el envío en segundo plano en Kotlin: gasto, `notify` y renovación de sesión) mandan `Origin` = esquema + host (+ puerto, sin ruta) derivado de `VITE_API_BASE` / `configureSync`, y nunca `Sec-Fetch-Site`. Cualquier `Origin` que ponga otra capa se reemplaza. La decisión original («sin Origin») y el parche S-01 del Worker quedan OBSOLETOS. La URL base es una variable de compilación `VITE_API_BASE` (no secreta); si está vacía, se usa `/supabase` como hoy en la web. NO verificado sin teléfono: que `CapacitorHttp` no añada su propio `Origin` (p. ej. `https://localhost`); el código reemplaza el nombre de cabecera sin distinguir mayúsculas.
- **DEC-02 (Google):** primero entrada por correo y contraseña totalmente funcional. Google nativo se implementa con `signInWithGoogleToken` ya existente y queda detrás de una bandera (necesita IDs de cliente de Google que debe crear el dueño); sin configurar, el botón se oculta.
- **DEC-03 (sesión):** almacenamiento seguro respaldado por Android Keystore, con adaptador de almacenamiento para supabase-js. Nada de tokens en localStorage dentro de la app nativa.
- **DEC-04 (push):** FCM. Se implementa el cliente y la migración nueva (solo como archivo en `supabase/migrations/`, probada en la base local de staging) y el emisor en `supabase/functions/notify`; queda desactivado mientras no exista `google-services.json`.
- **DEC-05 (acceso a notificaciones):** permiso concedido por el usuario en Ajustes, con pantalla guiada (incluye "Permitir ajustes restringidos" de Android 13+). Política de Google Play: fuera de alcance por ahora (distribución por GitHub).

## Valores por defecto de las preguntas abiertas
1. Versión mínima de Android: **API 26 (Android 8.0)**.
2. Cuotas: se registra **el valor de la cuota** y la nota lleva "cuota N/M" si el aviso lo dice.
3. Modo automático: **opcional, apagado por defecto**, por app y con un monto máximo configurable (por defecto 50.000 CLP). Fuera de esos límites siempre pide confirmación.
4. Conflictos sin conexión: los gastos se crean con id idempotente (`newId` + código 23505 ya existente), así que reenviar no duplica; para ediciones en conflicto gana la última, pero se avisa.
5. **Ocultar montos en la pantalla de bloqueo: activado por defecto.**

## Contratos (los tests los fijan; los desarrolladores los implementan)
- Kotlin (módulo JVM puro, sin dependencias de Android, en `native/parser`): `NotificationParser.parse(packageName: String, title: String?, text: String?, postedAtMillis: Long): ParsedCandidate?` devuelve `null` si no es un movimiento (OTP, promoción, saldo, clave). `ParsedCandidate(amountClp: Long, merchant: String?, kind: Kind /*EXPENSE|INCOME*/, confidence: Confidence /*HIGH|MEDIUM|LOW*/, installment: Installment? /*n, total*/, fingerprint: String)`.
- Los fixtures sintéticos F01..F32 de `requisitos.md` §3 viven como un archivo JSON compartido: `native/parser/src/test/resources/fixtures.json` (y se copian a `web/src/lib/__fixtures__/` si la lógica TypeScript los necesita). Son SINTÉTICOS, nunca reales.

## Reparto de carpetas (para no pisarse)
- **QA:** solo archivos `*.test.ts`, `*.test.kt` y fixtures de test. No escribe código de producción.
- **Android/backend:** `native/**` (parser Kotlin, plugin Capacitor, servicio de notificaciones, cola cifrada), `web/android/**`, `web/capacitor.config.ts`.
- **Front-end:** `web/src/**` (excepto tests de QA), estilos y recursos. Usa el plugin a través de una interfaz TypeScript.
- **iOS:** `web/ios/**` y `docs/mobile/ios.md`.
- **Docker/DevOps:** `docker/**`, `scripts/docker-*.sh`, `docker-compose.mobile.yml`.
- **Seguridad:** revisa todo, escribe `docs/mobile/seguridad.md` y propone parches como archivos; no edita código de otros.

## Reglas comunes
`AGENTS.md` del repo manda: solo local, nada de producción, sin `git push`, sin `gh`, sin leer `.env*`, sin imprimir secretos, sin sudo; reportar solo lo verificado con comandos reales. Ciclo TDD obligatorio: requisito → test → ver que FALLA → código mínimo → ver que PASA → refactor.

## DEC-06 (2026-11-21, decidida por el dueño): núcleo Kotlin Multiplatform bajo la interfaz actual
- La interfaz sigue siendo el React actual con Capacitor. NO se reescribe en Compose Multiplatform.
- La lógica de negocio compartida entre plataformas pasa a un módulo Kotlin Multiplatform (`native/core`): parser de notificaciones, importes CLP, validación de enlaces profundos, huella de deduplicación y reglas de candidatos/modo automático.
- Objetivos: `jvm` (pruebas en este PC Linux) y Android; los objetivos iOS se declaran pero solo compilan en un Mac (en Linux se omiten sin fallar).
- Hoy existen copias de la validación del enlace profundo en TypeScript, Kotlin y Swift; el núcleo KMP las unifica a futuro. Se hace DESPUÉS de que el agente de backend deje `native/parser` en verde, sin romper sus 63 tests (se migran a `commonTest`/`jvmTest`).
- Límite: la lógica de TypeScript existente (cola sin conexión, mapeo de errores) no se reescribe por ahora; se evalúa más adelante.
