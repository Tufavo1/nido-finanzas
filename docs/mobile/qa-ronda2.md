<!-- Copyright (c) 2026 Dinovance -->
# QA ronda 2: cierre de los 17 hallazgos y defectos nuevos (2026-11-21)

Todo local (host y staging `nido-selfhost-db-1`), datos sintéticos, sin producción, sin Docker para compilar. Los tests nuevos que fallan se dejaron en rojo; no se tocó código de producción ni los tests de la ronda 1 (los 23+9+13 siguen y ahora pasan).

## 1. Corrida completa (números reales)
| Qué | Resultado |
|---|---|
| `gradle -p native/core jvmTest` | 125 tests, **9 fallan** (todos nuevos de esta ronda; los 115 anteriores pasan) |
| `gradle :app:testDebugUnitTest` (web/android) | 43 tests, **4 fallan** (nuevos; los 36 anteriores pasan) |
| `npm --prefix web test` | 825 tests, **5 fallan** (nuevos), 820 pasan |
| `TZ=UTC npm --prefix web test` | igual: 825, 5 fallan, 820 pasan (H-13 cerrado también en UTC) |
| `tsc -b web` | limpio |
| lint (oxlint) | 0 errores, solo advertencias previas |
| SQL staging `observabilidad.sql`, `push_nativo.sql` | pasan |
| `ingesta_seguridad.sql` | pasa (hay que correrlo como `supabase_admin`; con `postgres` da «permission denied to set role», como dice su encabezado) |
| `docs/mobile/qa/e2e-datos.sh` | 40/40 PASA (en la ronda 1 era 39/40: E27 ya cerrado) |
| `docs/mobile/qa/e2e-ronda2.sh` (nuevo) | 13 PASA, **2 FALLA** (R9, R10), 2 INFO (R13, R14) |
| Migraciones `150000` y `160000` aplicadas dos veces seguidas en transacción | sin error (idempotentes) |

## 2. Estado de H-01 a H-17
| ID | Estado | Evidencia |
|---|---|---|
| H-01 cierre de sesión | **PASA** | `wipe.native.test.ts` verde; `wipe.ts` llama `ContigoNative.wipe()` y `wipeForAccountSwitch` |
| H-02 id en la cola | **PASA** | `useDetected` y `Register` pasan `{ ...form, id }` (test de lectura en `qaRonda2.test.ts`) y `enqueue` respeta el id (tests H-02 verdes). Nota: el doc de backend aún dice «abierto»; está desactualizado |
| H-03 id derivado del borrador | **PASA** | `draftExpenseId` verde y sin `Map` en memoria |
| H-04 ventana deslizante | **PARCIAL** | La ventana ya solo recuerda lo guardado (test original verde). Pero la huella incluye el minuto: dos avisos iguales del MISMO minuto (5 s y 55 s) se descartan aunque el diseño diga «45 s a 2 min se guarda». Ver R2-01 |
| H-05 confirmados no caducan | **PARCIAL** | Verde el test original y `ReminderReceiver` está en el manifiesto. Efecto colateral nuevo: acumulación hasta 50 y captura detenida (R2-04) |
| H-06 dueño del borrador | **PASA** | `ownerKey` filtrado por dueño; persistido en preferencias (sobrevive a reinicios). Efecto colateral: R2-03 |
| H-07 carrera | **PASA** | test de 6 hilos verde |
| H-08 paquete propio | **PASA** | verde |
| H-09 falsos positivos | **PASA** | los 20 avisos y «$12 990» verdes |
| H-10 caracteres invisibles | **PASA** | Kotlin, TS y enlace verdes. Cosmético nuevo: R2-13, R2-14 |
| H-11 alerta anónima | **PASA** | R16 (anónimo no crea eventos) y R17 (con sesión sí). Residual: R14 |
| H-12 `console.error` crudo | **PASA** | test de lectura verde |
| H-13 zona horaria | **PASA** | verde con `TZ=UTC` y con las otras zonas |
| H-14 notificación actualizada | **PARCIAL** | Completar un borrador sin comercio funciona, pero fusiona compras distintas (R2-02) |
| H-15 Throwable | **PASA** | verde |
| H-16 SecureKeyValueStore | **PARCIAL** | La lectura del código cubre `GeneralSecurityException`; `AtomicFile` sigue sin correr en JVM, solo se prueba `removeByPrefix` |
| H-17 paquete de origen | **PASA** | `Draft.sourcePackage` |

### Decisiones de diseño pedidas
- **Duplicados.** Hoy: misma huella → se descarta; mismo monto y comercio a menos de 45 s → se descarta; entre 45 s y 2 min → se guarda marcado `possibleDuplicate`. Se puede perder una compra legítima en dos casos: dos cafés iguales a menos de 45 s (aceptable y declarado, el sistema reenvía el aviso al cambiar de minuto) y, sin necesidad, dos cafés iguales dentro del mismo minuto aunque pasen 50 s (R2-01, es un defecto, no una decisión). Recomendación: quitar el minuto de la huella y decidir solo por la distancia en segundos entre avisos.
- **H-14.** Sí puede fusionar dos compras distintas: el borrador completado sigue marcado como «sin comercio» y absorbe el siguiente aviso con el mismo monto (R2-02). Además la notificación visible no se actualiza con el comercio.
- **H-11.** Un atacante anónimo SÍ puede agotar el cupo `anon` (30 por 10 min) y silenciar los reportes de otros anónimos (R14). No afecta a quien tiene sesión (R15 pasa) y la app envía los cierres inesperados con sesión en el siguiente arranque, así que el impacto es bajo.

## 3. Defectos nuevos
| ID | Gravedad | Hallazgo y cómo reproducir | Test que falla |
|---|---|---|---|
| R2-01 | Media | Huella por minuto: avisos iguales a 5 s y 55 s del mismo minuto se descartan, compra real perdida. | `QaRonda2Test` «dos compras iguales separadas por 50 s» |
| R2-02 | Media | Completar sin comercio: aviso «Cargo $4.000» + «KIOSCO ALFA» + «KIOSCO BETA» (mismo monto, 10 s cada uno) deja una sola compra (BETA pisa a ALFA). | `QaRonda2Test` «completar un borrador sin comercio no fusiona…» |
| R2-03 | Media | (a) Sin sesión (`NO_SESSION`) el aviso se pierde sin dejar rastro: no hay contador ni aviso posterior. Entre cerrar sesión y volver a entrar (por ejemplo una noche) no se captura nada y la persona no se entera. Recuperación hoy: ninguna. Nota: el dueño sí persiste tras reiniciar el teléfono (preferencias), así que el reinicio no pierde avisos. | `QaRonda2Test` «los avisos que llegan sin sesión dejan constancia» |
| R2-04 | Media | Los `CONFIRMED` no caducan y los de otro dueño nunca se ven: se acumulan hasta 50 (por ejemplo tras cambiar de hogar la misma persona, que no llama `wipeForAccountSwitch`) y desde ahí cada compra nueva da `QUEUE_FULL` sin aviso. | `QaRonda2Test` «borradores confirmados ajenos y viejos…» |
| R2-09 | Media | `$12,99`, `$12.99` y `$12,5` se leen como **12 pesos con confianza ALTA** (Kotlin y TypeScript). Un monto en dólares sin marca de moneda se anotaría como 12 pesos, y en modo automático se guardaría solo. `$12.990,50` y `USD 12,99` sí están bien. | `AdversarialRonda2Test` R2-09 (3) y `qaRonda2.test.ts` R2-09 (3) |
| R2-10 | Baja/Media | Un comercio que empieza con dígito pierde el nombre: «7-ELEVEN», «3B», «99 Centavos» dan comercio vacío (confianza MEDIUM). El filtro pensado para «en 3 cuotas» es demasiado amplio, también en `bankNotice.ts`. | `AdversarialRonda2Test` R2-10 (3) y `qaRonda2.test.ts` R2-10 (2) |
| R2-13 | Baja | `UnsafeChars` borra el unidor de ancho cero de los emoji compuestos: «Chef 👨‍🍳» queda «Chef 👨🍳» (cosmético). | `AdversarialRonda2Test` R2-13 |
| R2-14 | Baja | El espacio duro U+00A0 se conserva en el comercio: «Cafe Demo» y «Cafe Demo» cuentan como comercios distintos (dedupe y aprendizaje de categoría). | `AdversarialRonda2Test` R2-14 |
| R2-15 | Baja | La ingesta del gateway acepta `count` y `status` no numéricos o fuera de rango (`"abc"`, `-5`, 20 dígitos). `security_overview` no se rompe (R12), pero queda basura en la tabla. | `e2e-ronda2.sql` R9 y R10 (FALLA) |
| R2-16 | Baja (INFO) | Tope global de ingesta 600/min: un solo origen puede llenarlo y los eventos de otros se descartan en silencio (610 enviados, 598 guardados). Inherente a este diseño; documentarlo como límite del panel. | `e2e-ronda2.sql` R13 (INFO) |
| R2-17 | Baja (INFO) | Cupo anónimo de `report_client_error` agotable por un atacante (R14). | `e2e-ronda2.sql` R14 (INFO) |

### Revisado y sin defecto (con evidencia)
- (b) Claves de dueño: el plugin acepta `[A-Za-z0-9:_-]{1,100}`; dos UUID con `:` miden 73. No hay forma de inyectar rutas ni caracteres raros.
- (c) Recordatorio: `ReminderReceiver` está declarado en el manifiesto; la alarma usa el mismo `PendingIntent` (`UPDATE_CURRENT`) y por eso no se duplican alarmas; se reagenda al conectar el servicio tras un reinicio; cuenta solo lo confirmado del dueño activo y calla con 0 pendientes (test verde R2-07). Observaciones: cada «Guardar» reinicia el plazo de 2 h; el recordatorio sigue cada 24 h mientras haya pendientes aunque el permiso de notificaciones esté revocado (inofensivo). **No verificado** en teléfono real: que la alarma dispare en Doze y que el permiso revocado no genere error.
- (d) `removeByPrefix("queue-")` borra los archivos `queue.*` y sus temporales `.new`, deja sesión y demás claves, y no hace nada con prefijos vacíos o raros (tests verdes R2-05 y R2-06). Limitación de diseño: como el nombre usa el hash, un prefijo más específico (`queue-<hogar>`) borra todas las colas, no solo esa.
- (e) Comercios legítimos con tildes, ñ, emoji, `&`, apóstrofe y comillas tipográficas se conservan (R2-12 verde).
- (f) `$12.990,50`, `$1.234.567,89`, `$1 234 567`, `USD 12,99`, `12,99 USD`, `EUR 12,99`, `$1,234,567` se leen bien o se descartan; el problema son los decimales sin marca de moneda (R2-09).
- (g) Migraciones `150000` y `160000` idempotentes (dos aplicaciones seguidas sin error). `sec_ingest`: no lee `expenses`, `security_events` ni `auth.users`, no inserta directo, no crea tablas y no puede llamar a `create_household`, `admin_status` ni `security_overview` (R1 a R8 pasan). El detalle solo admite las claves permitidas y valida `ip` y `req_id`.
- (h) E2E de datos con dos hogares tras los cambios: 40/40 (id idempotente dos veces = una fila, RLS entre hogares, validaciones, `report_client_error`, `security_overview` solo para admin con aal2).

## 4. No verificado (necesita teléfono real o infraestructura)
Alarmas y recordatorio en Doze, permiso de notificaciones revocado, cambio de cuenta de punta a punta, `SecureKeyValueStore` con Keystore real, comportamiento de la notificación al completarse un borrador, servicio con avisos reales y agrupados, tamaño del puente de Capacitor, FCM, el gateway HTTP real con la ingesta, y el Worker con su límite de tasa.

## 5. Cómo reproducir
```bash
source ~/.config/mobile-env.sh
gradle -p native/core jvmTest                       # 125 tests, 9 rojos
(cd web/android && gradle :app:testDebugUnitTest)   # 43 tests, 4 rojos
npm --prefix web test                               # 825 tests, 5 rojos (igual con TZ=UTC)
bash docs/mobile/qa/e2e-datos.sh                    # 40/40
bash docs/mobile/qa/e2e-ronda2.sh                   # 13 PASA, 2 FALLA, 2 INFO
```
Archivos nuevos: `web/android/app/src/test/kotlin/cl/dinovance/contigo/QaRonda2Test.kt`, `native/core/src/jvmTest/kotlin/cl/nido/parser/AdversarialRonda2Test.kt`, `web/src/lib/qaRonda2.test.ts`, `docs/mobile/qa/e2e-ronda2.{sql,sh}`.
