// Copyright (c) 2026 Dinovance
// Lado base de datos de «Fue pago de una deuda»: mismas tablas y reglas (RLS) de siempre, sin esquema nuevo.
import type { Expense } from './data'
import { convertExpenseToDebtPayment, paymentFromExpense } from './expenseToDebt'
import { newDebtRow } from './movements'
import { deleteDebtPaymentRow, insertDebtPaymentRow, insertDebtRow } from './saveMovement'
import { deleteExpense } from './saveExpense'
import { insertExpenseRow } from './saveExpense'

export type DebtDest = { debtId: string } | { name: string; balance: number }

/** Pasa el gasto a pago: devuelve el id del pago creado. Lanza ConvertError si algo falla (ver convertExpenseToDebtPayment). */
export async function convertExpenseInDb(a: { householdId: string; meId: string; expense: Expense; dest: DebtDest }): Promise<{ paymentId: string }> {
  const { expense: e } = a
  const newDebt = 'debtId' in a.dest ? null : newDebtRow(a.householdId, { id: `gasto:${e.id}`, kind: 'DEBT_PAYMENT' } as never, a.dest.name, a.dest.balance)
  const debtId = 'debtId' in a.dest ? a.dest.debtId : (newDebt as NonNullable<typeof newDebt>).id
  const payment = paymentFromExpense(a.householdId, e, debtId, a.meId)
  await convertExpenseToDebtPayment({
    createDebt: newDebt ? () => insertDebtRow(newDebt) : undefined,
    insertPayment: () => insertDebtPaymentRow(payment),
    deleteExpense: () => deleteExpense(e.id),
    deletePayment: () => deleteDebtPaymentRow(payment.id),
  })
  return { paymentId: payment.id }
}

/** Deshacer: devuelve el gasto tal cual era (mismo id) */
export async function reinsertExpense(e: Expense): Promise<boolean> {
  return (await insertExpenseRow(e as never)).ok
}

export const removePayment = deleteDebtPaymentRow
