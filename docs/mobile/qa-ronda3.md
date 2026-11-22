# QA ronda 3: registro automático por banco, envío en segundo plano, Deshacer y gasto mayor

Alcance: solo local (sin nube, sin Docker para compilar, sin `.env`). Solo se escribieron tests y scripts. Un hallazgo es un test en rojo con su gravedad. Datos sintéticos: los avisos reales de los bancos no se verificaron y no hay teléfono real.

## Números reales (esta corrida)

| Suite | Resultado |
|---|---|
| core `jvmTest` | 125 tests, 0 rojos (los 9 rojos de la ronda 2 ya están cerrados) |
| app `:app:testDebugUnitTest` | 75 tests, 10 rojos (los 10 son de `QaRonda3Test`; los otros 54 pasan) |
| vitest | 882 tests, 2 rojos (ambos de `qaRonda3.test.ts`); igual con `TZ=UTC` |
| `tsc -b` | sin errores |
| lint | 0 errores, 20 advertencias |
| SQL staging `supabase/tests/*.sql` | 14 de 15 archivos pasan. `fecha_nacimiento.sql` falla porque a staging le falta la migración 20261111 (`birth_date` no existe): deriva del entorno, no es de esta funcionalidad |
| `alerta_gasto_mayor.sql` | pasa |
| `e2e-datos.sh` | 40 PASA, 0 FALLA |
| `e2e-ronda2.sh` | 15 PASA, 0 FALLA, 2 INFO (R13 y R14, ya conocidos) |
| `e2e-ronda3.sh` (nuevo) | 23 PASA, 0 FALLA, 1 INFO |

## Hallazgos (test en rojo)

| ID | Gravedad | Hallazgo | Test |
|---|---|---|---|
| R3-01 | Alta | `ExpenseSyncer` nunca llama a `notify` tras enviar. Un gasto guardado con la app cerrada no avisa a la pareja, ni normal ni como gasto mayor. | `r3-3d` |
| R3-02 | Alta | Ventana entre sesión cerrada y nueva: el token que se envía puede ser de otra persona que el perfil. Con la pareja del mismo hogar, la base acepta un gasto compartido con `paid_by` = la otra persona. | `r3-3c` |
| R3-03 | Alta | Carrera al cambiar de cuenta: `setActiveOwner(A)` en vuelo, `wipeForAccountSwitch` y luego `setAutoProfile(A)`. El perfil de A (comercios aprendidos) sobrevive. | vitest `r3-2` (2 tests) |
| R3-04 | Media | `setAutoProfile` guarda cualquier `ownerKey`, sin comprobar que sea el dueño activo. Es la causa de R3-03. | `r3-5d` |
| R3-05 | Media | "Borrar todo lo capturado" (`clearCaptured`) no borra el perfil automático: el teléfono sigue guardando solo. | `r3-5b` |
| R3-06 | Media | Deshacer dice "deshecho" aunque la app abierta ya envió el gasto. El registro queda con `synced=false`, el borrador ya no existe y el gasto sigue en el servidor. | `r3-4a` |
| R3-07 | Media | Deshacer no se coordina con `syncOnce()`. Si el envío está en vuelo, el borrado local llega tarde y el gasto igual se envía. | `r3-4b` |
| R3-08 | Media | El registro de guardados no tiene dueño. Otra persona en el mismo teléfono ve lo ajeno y puede deshacerlo. | `r3-5a` |
| R3-09 | Media | Una fila rechazada (400) se reenvía en cada sincronización, queda para siempre en la cola y su error tapa el éxito de las filas nuevas. | `r3-3b` |
| R3-10 | Baja | El perfil acepta ids de 36 guiones como UUID; después la base rechaza esa categoría para siempre. | `r3-1c` |
| R3-11 | Baja | `note.take(120)` puede cortar un emoji (par sustituto) por la mitad; el JSON queda inválido y el gasto se traba. | `r3-1b` |

## Lo que se cumple

- Nunca se guarda solo: abono, borde inclusivo del tope (50.000 sí, 50.001 no), confianza no ALTA, comercio sin categoría aprendida, posible duplicado, banco apagado, banco sin app asociada, paquete no asociado, perfil ausente o de otro dueño, sin dueño (`NO_SESSION`, sin agendar el envío), comercio hostil (`‮`, `\u0000`, `W:CAFE`, JSON dentro del comercio).
- Envío en segundo plano: mismo id en cada reintento, 23505 cuenta como éxito, retroceso exponencial de 30 s, 401 con renovación fallida deja el borrador y solo registra la clase `AUTH`. No hay `Log`, `println` ni cabecera `Origin` en el código de sync.
- Fecha America/Santiago correcta en el borde de medianoche, en verano e invierno.
- Gasto mayor en la base: RLS por persona (la pareja no lee ni edita la preferencia de A), sin escritura directa, anónimo sin acceso, umbral negativo, cero, enorme y NULL rechazados con 22023, la preferencia no apunta a otro hogar y se borra con la cuenta.
- `recipients.ts` (vitest): borde del umbral inclusivo, umbral propio por persona, ambos activados, sin preferencia, umbral inválido, ids hostiles. El cuerpo del push solo lleva monto y categoría (la lectura del gasto no trae la nota), el creador queda fuera con `neq('user_id', uid)`, y si falla la lectura de preferencias (migración ausente) todos reciben el aviso normal.
- Privacidad: los archivos nuevos del front no usan `console`, `localStorage` ni errores con interpolación. El registro de guardados no guarda el texto del aviso. Ante un fallo, la salud solo registra la clase de la excepción.

## INFO (sin test en rojo)

- Modo automático global de Ajustes frente a guardados por banco: `planDrafts` decide solo con `config.mode` y no conoce el interruptor del banco. Con el modo global encendido y un banco apagado, al abrir la app se guarda igual un borrador PENDING de ese banco. No es un fallo seguro (el borrador igual cumple las reglas), pero es una inconsistencia con "banco apagado nunca se guarda solo". Conviene decidir la regla.
- Deshacer con `needsDelete` borra por `id` sin comprobar `created_by`. Por RLS, la pareja puede borrar un gasto compartido que registró A (D4). Un gasto personal de A no se puede borrar (D3b). Esto es por diseño del hogar.
- Un id de otro hogar da 23505 y el envío lo cuenta como éxito (D6). Exige conocer un UUID v4; riesgo bajo.
- Heredado de la ronda 2: R13 (tope global de ingesta) y R14 (cupo anónimo).

## Sin verificar

Teléfono real: notificaciones y WorkManager reales, el orden real en que Capacitor ejecuta los métodos del plugin (se modeló como serial en orden de emisión), el formato de los avisos reales de los cuatro bancos, y la ruta Worker/Cloudflare del envío sin `Origin`.

## Cómo repetir

- `cd web/android && gradle --offline :app:testDebugUnitTest --tests '*QaRonda3Test*'`
- `npm --prefix web test -- src/lib/qaRonda3.test.ts`
- `bash docs/mobile/qa/e2e-ronda3.sh` (staging local, `ROLLBACK` al final)

Archivos: `web/android/app/src/test/kotlin/cl/dinovance/contigo/QaRonda3Test.kt`, `web/src/lib/qaRonda3.test.ts`, `docs/mobile/qa/e2e-ronda3.{sql,sh}`.
