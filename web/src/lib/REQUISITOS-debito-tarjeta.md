# Requisitos: débito y tarjeta de crédito (modelo de dos cuentas)

Pruebas: `debitoTarjeta.test.ts` (cada `it` empieza con su número de requisito).

- **R1** `isCardExpense`: un gasto es con tarjeta solo si `payment_method === 'tarjeta'`; ausente, null o 'debito' es débito.
- **R2** `myCardSpent`: suma mi parte (`myShare`) de los gastos con tarjeta; excluye los de débito y, si se pasa un mes, solo cuenta los de ese mes (prefijo AAAA-MM de `spent_on`).
- **R3** `cardCharges`: los gastos con tarjeta con `card_debt_id` de esa tarjeta; si el gasto no tiene tarjeta y en el hogar hay una sola deuda `kind='tarjeta'`, se asocia a ella; si hay varias, queda sin asignar (no suma a ninguna). Una deuda que no es tarjeta no tiene cargos.
- **R4** `cardBalance` sin saldo informado: usado = monto anotado + compras con tarjeta desde la fecha de alta − pagos, nunca bajo 0, sin interés.
- **R5** `cardBalance` con saldo informado: usado = saldo informado + compras con fecha posterior al informe − pagos desde la fecha del informe (el del mismo día incluido, regla de la 1.3.2), nunca bajo 0. Las compras del mismo día o anteriores y los pagos anteriores no se suman (ya están en el saldo del banco). `informed`, `informedAt` y `sinceInformed` lo reflejan.
- **R6** `debtView`: una tarjeta no acumula interés compuesto (accrued 0) y su saldo es el de `cardBalance`; consumo, hipotecario y otro siguen igual que antes. La firma vieja `debtView(d, pagos, now)` sigue funcionando.
- **R7** `myDebtPaidThisMonth`: lo pagado este mes que me toca: deuda mía 100 %, sin dueño según el reparto, de la otra persona 0.
- **R8** `myDebtDue`: cuota que falta pagar este mes (cuota − pagado, ≥ 0, sin pasar del saldo), solo deudas con saldo > 0, con el mismo reparto de R7. Es 0 si ya se pagó la cuota o si el saldo es 0.
- **R9** `CMR_ADMIN_UF` y `cardMonthlyFee`: comisión informativa = UF del plan × valor UF, redondeada.
- **R10** `draftPaymentMethod`: 'tarjeta' solo si el teléfono informa `medium === 'CREDIT'`; DEBIT, UNKNOWN o sin dato es 'debito'. Un gasto detectado con CREDIT llega al formulario como tarjeta; un pago o transferencia no.
- **R11** Fila del gasto (`expenseRow` / guardado): con tarjeta manda `payment_method: 'tarjeta'` y `card_debt_id`; con débito no manda ninguno de los dos.
- **R12** Reinsertar un gasto (deshacer) o restaurar un respaldo: manda `payment_method` y `card_debt_id`; si la tarjeta ya no existe, `card_debt_id: null`; un respaldo viejo sin esos campos se restaura como 'debito'. Al restaurar, las deudas van antes que los gastos.
- **R13** `salaryFlows`: spent = costo real − mis compras con tarjeta del mes (≥ 0); commitments = lo realmente pagado en el mes; pendingDebt = cuota pendiente solo en el mes en curso (0 en meses pasados).
- **R14** «Te queda del sueldo» igual en Números, Análisis, Avisos y el monto tras guardar un movimiento: sueldo − gastos con débito − pagos hechos − ahorro, y lo que falta de la cuota se trata como por pagar (igual que un fijo pendiente).
- **R15** Escenario: sueldo 1.000.000, débito 300.000, tarjeta 200.000, pago a la tarjeta 150.000 → te queda 550.000 y la tarjeta sube 200.000 − 150.000 = 50.000.
- **R16** Los gastos con tarjeta siguen contando en los reportes de gasto (costo del mes y categorías).
- **R17** Tarjeta con saldo informado hoy: detalle, lista, «Falta pagar en total», análisis de deudas y Números muestran exactamente ese saldo; no se le suman el monto anotado, la cuota, el interés estimado ni las compras ya incluidas. El interés mensual estimado se muestra aparte (`interest`). Pruebas: `saldoInformadoTarjeta.test.ts`.
- **R18** `cardEditReport`: al editar una tarjeta, «Cupo utilizado según tu banco hoy» parte de lo que hoy se ve como usado; si cambia (o la tarjeta aún no tenía saldo informado) queda como saldo informado con fecha de hoy. Sin cambios en una tarjeta ya informada, no se toca.
- **R19** `scopeDebtShares`: en una tarjeta de los dos, la parte de una persona también reparte el saldo informado (no solo el monto anotado, la cuota y los pagos).
- **R20** `sameNameCard`: al agregar una tarjeta con el mismo nombre que una activa, el formulario avisa que se contaría dos veces y sugiere actualizar su saldo.
