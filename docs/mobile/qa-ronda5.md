<!-- Copyright (c) 2026 Dinovance -->
# QA ronda 5: RLS e integridad contra el esquema REAL (Postgres nuevo y desechable)

Qué cambia respecto de la ronda 4: `e2e-ronda4` corría contra la base de staging. Esta ronda levanta un Postgres **nuevo** (`public.ecr.aws/supabase/postgres:17.11.0.011`, imagen local, contenedor sin red), aplica **las 30 migraciones** de `supabase/migrations` en orden y prueba con el rol real `authenticated` las filas con las columnas **exactas** que manda la app. No toca staging, `supabase_db_nido`, producción ni la red. Todo en una transacción con `ROLLBACK` y el contenedor se borra al terminar.

Shims mínimos (son de servicios de Supabase, no de la app): esquema `realtime` (`realtime.send`/`messages`, los crea el servicio Realtime), `auth.jwt()`, `auth.uid()`/`auth.role()` con la versión de GoTrue (la imagen trae la antigua que solo lee `request.jwt.claim.sub`) y columnas de `auth.users`/`auth.audit_log_entries` que agrega GoTrue (`email_confirmed_at`, `ip_address`...). Si una migración no aplica, el script lo dice y se detiene.

## Resultado real (2026-11-22)

`bash docs/mobile/qa/e2e-ronda5.sh` → `INFO cadena aplicada: 30 migraciones`, **`RESUMEN pasa=59 falla=0 info=4`**. Sin contenedores residuales.

| Bloque | Qué prueba (todo con las columnas de la app) | Resultado |
|---|---|---|
| (a) ingresos | A inserta `{id, household_id, amount, source, received_on}` (incomeRow) y `user_id` lo pone `auth.uid()`; la pareja B no lo lee (ni la tabla completa), no lo modifica ni lo borra (0 filas, la fila sigue); B no inserta a nombre de A (`42501`); otro hogar no inserta; A no mueve su ingreso a otro hogar (`42501`, GRANT por columna); anon no lee | 13 PASA |
| (b) idempotencia | El mismo id dos veces da `23505` en `incomes`, `debt_payments` y `debts`, y queda una sola fila | PASA |
| (c) borrar ingreso | A borra el suyo (1 fila); B no puede borrar el de A (0 filas) | PASA |
| (d) gasto → pago de deuda | Pago con las columnas de `paymentFromExpense` + borrar el gasto propio personal (1 fila); repetir = `23505`; deshacer reinserta con el mismo id; borrar el gasto **personal** de B: **0 filas sin error** (ver R5-DB-02); pago contra deuda de otro hogar o con `household_id` ajeno, contra la deuda personal de B o a nombre de B: `42501`; mover el pago propio a la deuda personal de B, a otro hogar o reasignarlo a B con `UPDATE`: `42501` (solo se pueden actualizar `amount` y `paid_on`); otro hogar no lee ni borra; la pareja no borra el pago de A | 16 PASA, 3 INFO |
| (e) deuda nueva (`newDebtRow`) | `{id, household_id, name, kind:'tarjeta', original_amount, monthly_payment:0, monthly_rate:0, owner_id:null, due_day:null}` pasa los checks; `kind 'otro'` y nombre de 60 caracteres pasan; 61 caracteres, saldo 0, nombre vacío y `kind` inválido dan `23514`; la pareja no crea una deuda personal a nombre de A; otro hogar no crea; el pago contra la deuda recién creada funciona | 10 PASA |
| (f) fechas válidas (trigger `check_fecha_valida`) | Ingreso con fecha de mañana se acepta (margen de 1 día), pasado mañana y antes de 2000 se rechazan (`23514`), 2000-01-01 se acepta; lo mismo en gastos y pagos; el trigger cubre también `UPDATE` de `spent_on`/`received_on`; sin fecha usa el día de Santiago | 10 PASA |
| (g) `native_push_tokens` | A registra su token (`user_id` por defecto); B no lo lee, no lo borra, no se lo apropia con `UPDATE` (`42501`), no registra a nombre de A; token con caracteres raros `23514`; el token 11 de la misma persona `54000`; A borra el suyo; anon no lee | 9 PASA, 1 INFO |

## Huecos de RLS reales

**Ninguno encontrado.** El candidato más serio (D11: `UPDATE debt_payments SET debt_id = <deuda personal de la pareja>`, porque la política de UPDATE no vuelve a mirar el dueño de la deuda) **no** es explotable: `20261018060000_perfil_edicion.sql:35` solo concede `UPDATE (amount, paid_on)`, y el intento da `42501 permission denied`. Si algún día se amplía ese GRANT, la política de UPDATE debe copiar la condición de la deuda del INSERT; D11/D12/D13 lo detectarían.

## INFO (comportamiento de diseño, no son fallos)

- **D14**: un miembro puede borrar un gasto **compartido** pagado por la pareja (lo compartido es de ambos). La UI solo convierte a pago de deuda los gastos propios personales (`canConvertToDebt`).
- **D18**: un miembro puede pasar un gasto compartido de la pareja a gasto **personal suyo** (`UPDATE shared=false, paid_by=yo`): lo permiten el GRANT por columna (`paid_by`, `shared`) y la política (`shared OR paid_by = uid` antes y después). No da acceso a datos ajenos, pero cambia quién figura que pagó. Si se quiere impedir: que `expenses_update` exija `paid_by` sin cambio cuando no es propio (decisión de producto; no propongo SQL sin esa decisión).
- **D19**: quien crea un gasto puede insertarlo con `notified_at` ya puesto, y así la función `notify` no avisa a la pareja. Igual da lo mismo: la llamada a `notify` la hace el cliente que crea el gasto, así que el «aviso de gasto mayor» **no es un control antifraude** frente a la propia pareja (conviene que la pantalla no lo prometa).
- **T6** (S-11): `token` es único en toda la tabla; si B intenta registrar el mismo token que dejó A, recibe `23505` (revela que existe). Solución cuando se conecte FCM de verdad: borrar el token al cerrar sesión o al cambiar de cuenta.

## Hallazgo de app que demuestra el e2e

**R5-DB-02 (Bajo, integridad).** `deleteExpense` (`web/src/lib/saveExpense.ts:27`) no revisa cuántas filas borró. Con RLS, borrar una fila que no se puede borrar devuelve **0 filas y ningún error** (D6). En la conversión «Fue pago de una deuda» (`expenseToDebtDb.ts:21`) eso daría por buena la conversión con el gasto todavía ahí (pago y gasto a la vez = doble conteo). Hoy solo pasa en carreras (el gasto lo borró o lo cambió otro teléfono), porque la UI solo ofrece convertir gastos propios personales. Parche propuesto (sin aplicar): `docs/mobile/seguridad/parches/r5-borrado-estricto-conversion.patch` (`deleteExpenseStrict` con `.select('id')` que falla si no borró exactamente 1 fila; la conversión ya sabe retirar el pago si el borrado falla).

## Cómo repetir

- `bash docs/mobile/qa/e2e-ronda5.sh` (necesita docker y la imagen local; si faltan, imprime `INFO ... no se ejecuto` y sale con código 3).
- `KEEP=1 bash docs/mobile/qa/e2e-ronda5.sh` deja el contenedor para inspeccionarlo (bórralo después con `docker rm -f <nombre>`).

## Sin verificar

PostgREST real (los mensajes 0 filas/`42501` se ven igual en la API, pero no lo probé con HTTP), GoTrue real (uso shims), Realtime (shim sin efecto), y las funciones `notify` y `housekeeping` (no se ejecutaron).
