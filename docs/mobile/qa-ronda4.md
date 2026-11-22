# QA ronda 4: Compraste, Recibiste y Pagaste a tu CMR (ingresos y pagos de deuda)

Alcance: solo local, sin producción, sin Docker para compilar, sin `.env`. Solo se escribieron tests y scripts. Datos sintéticos; los avisos oficiales son los que entregó el dueño. Un hallazgo es un test en rojo con su gravedad.

## Números reales

| Suite | Resultado |
|---|---|
| core `jvmTest` | 169 tests, 0 rojos (19 nuevos en `AdversarialRonda4Test`, todos verdes) |
| app `:app:testDebugUnitTest` | 132 tests, 2 rojos (16 nuevos en `QaRonda4Test`, 14 verdes) |
| vitest | 1011 tests, 4 rojos (24 nuevos en `qaRonda4.test.ts`, 20 verdes). Igual con `TZ=UTC` |
| `tsc -b` | sin errores |
| SQL staging `e2e-ronda4.sh` (nuevo) | 18 PASA, 0 FALLA, 2 INFO |
| `e2e-datos.sh` / `e2e-ronda2.sh` / `e2e-ronda3.sh` | 40 PASA / 15 PASA, 2 INFO / 23 PASA, 1 INFO |

## Hallazgos (test en rojo)

| ID | Gravedad | Hallazgo | Test |
|---|---|---|---|
| R4-01 | Media | `matchDebt` ofrece "pago de un toque" a una deuda cuyos últimos 4 dígitos contradicen la cuenta del aviso (·5766 contra una deuda "CMR Mastercard 9999"). | vitest `ROJO si los ultimos 4 digitos CONTRADICEN` |
| R4-02 | Media | Una sola palabra genérica coincide y basta para el toque único: la cuenta "CMR Mastercard Premium ·5766" empareja con la deuda "Mastercard Santander", y el pago se abonaría al banco equivocado. | vitest `ROJO una sola palabra generica` |
| R4-03 | Baja | `ExpenseSyncer.rowOf` no es segunda barrera: arma una fila de `expenses` para un ingreso o pago. Hoy solo lo frena el filtro de `syncOnce`. | app `r4-3 ROJO rowOf` |
| R4-04 | Baja | `ReminderPolicy.pendingToSend` cuenta ingresos y pagos CONFIRMED como "gastos por enviar". El teléfono nunca los envía, así que el recordatorio sería eterno. El front ya los excluye en `pendingToSendCount`; el nativo no. | app `r4-3 ROJO un ingreso CONFIRMED` |
| R4-05 | Baja | `incomeRow` y `debtPaymentRow` usan la fecha del toque de Guardar, no la del aviso. Un aviso del 31-dic 23:50 guardado al día siguiente cae en el mes y balance equivocados. | vitest `ROJO ... fecha DEL AVISO` |
| R4-06 | Baja | `sanitizeAccount` no quita los aislantes bidi U+2066..2069 ni el BOM U+FEFF. | vitest `ROJO los aislantes bidi` |

## Lo que se cumple

- Avisos oficiales exactos: compra con débito (6.778, comercio "Ganaderia Rio Bueno S.a"), compra CMR (20.798, cuenta "CMR Mastercard Premium ·5766"), ingreso (10.000) y pago de CMR (34.400, `DEBT_PAYMENT`).
- Variantes hostiles del parser, todas verdes:
  - Comercio con JSON, comillas o la palabra "Abono", "Reembolso" o "Pagaste a tu CMR": sigue siendo gasto.
  - Cuenta con bidi, `\u0000` o etiquetas queda limpia.
  - La cuenta nunca guarda más de 4 dígitos consecutivos (probado con 8 y 16 dígitos).
  - "No pagaste a tu CMR" no genera pago de deuda.
  - Montos de 99 mil millones no generan candidato, y montos en cero tampoco.
  - Un paquete no permitido no se lee.
  - El candidato no conserva el texto bruto.
  - Un ingreso con una compra dentro mantiene el monto del ingreso.
- Procesador nativo:
  - El gasto oficial con comercio aprendido se guarda solo.
  - Ingresos y pagos quedan PENDING, sin categoría, sin registro de guardados y sin agendar envío, incluso con el tope en 9.999.999.999 y todas las palabras clave aprendidas.
  - Dedupe por tipo: el mismo ingreso a 10 s es duplicado; dos pagos iguales a 60 s se guardan marcados como posible duplicado; un ingreso y un gasto del mismo monto no se confunden; un ingreso sin comercio no se fusiona con un gasto sin comercio.
- `ExpenseSyncer` no envía ni borra borradores de ingreso o pago CONFIRMED.
- Cambio de cuenta: los ingresos pendientes de A no se ven ni se envían a B, y quedan como ajenos para el borrado. Un ingreso capturado sin sesión lo adopta solo la misma persona.
- La notificación de ingreso o pago no ofrece "Guardar" ni nombra la cuenta. El receptor ignora "Guardar" para tipos que no son gasto. El borrador cifrado conserva tipo y cuenta sin el texto del aviso.
- Front: el modo automático global nunca guarda INCOME ni DEBT_PAYMENT. `parseNativeDraft` rechaza tipos y montos inválidos. `saveMovement` no quita el borrador si el insert devuelve false o lanza, y rechaza un tipo que no corresponde. El mismo borrador da el mismo id (el doble toque es 23505). Las filas no llevan comercio ni cuenta. El código nuevo no usa `console` ni `localStorage`.
- SQL de staging, `incomes` y `debt_payments`: id repetido da 23505 sobre `_pkey`; monto 0, negativo o ≥ 10.000.000.000, fecha futura y fuente de 5000 caracteres se rechazan; RLS correcta entre hogares y entre pareja (no se crea un ingreso a nombre de otra persona ni se abona a deuda ajena o personal ajena).

## INFO

- P6: la base acepta un pago a una deuda archivada; el front ya la excluye en `matchDebt`.
- P7: un pago mayor que lo adeudado se acepta (500.000 de deuda, pago de 9.999.999).
- Heredado: R13 y R14 de la ronda 2.

## Sin verificar

Avisos reales de otros bancos. Nota: el test `BankNoticeHardeningTest` estuvo mal compilado por otro agente a mitad de mi corrida y luego quedó bien. Sin teléfono real.

## Cómo repetir

- `gradle -p native/core jvmTest --offline -q`
- `cd web/android && gradle :app:testDebugUnitTest --offline -q`
- `cd web && npx vitest run src/lib/qaRonda4.test.ts`
- `bash docs/mobile/qa/e2e-ronda4.sh`

Archivos: `native/core/src/jvmTest/kotlin/cl/nido/parser/AdversarialRonda4Test.kt`, `web/android/app/src/test/kotlin/cl/dinovance/contigo/QaRonda4Test.kt`, `web/src/lib/qaRonda4.test.ts`, `docs/mobile/qa/e2e-ronda4.{sql,sh}`.
