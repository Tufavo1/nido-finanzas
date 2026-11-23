// Copyright (c) 2026 Dinovance
// «Fue pago de una deuda»: pasa un gasto ya guardado a pago de deuda sin contarlo dos veces. Lógica pura, con las acciones inyectadas.
import { draftExpenseId } from './draftExpenseId'
import type { DebtPaymentRow } from './movements'

export interface ExpenseLite {
  id: string
  amount: number
  spent_on: string
  paid_by: string
  shared: boolean
}

/** Solo los gastos propios y personales: uno compartido cuenta también en la parte de tu pareja, y uno ajeno la base no deja borrarlo. */
export const canConvertToDebt = (e: ExpenseLite, meId: string): boolean => e.paid_by === meId && !e.shared

/** Id estable del pago nacido de un gasto: repetir la acción no duplica el pago. */
export const paymentIdOfExpense = (expenseId: string): string => draftExpenseId(`pago-de-gasto:${expenseId}`)

export function paymentFromExpense(householdId: string, e: ExpenseLite, debtId: string, meId: string): DebtPaymentRow {
  return { id: paymentIdOfExpense(e.id), household_id: householdId, debt_id: debtId, amount: Math.trunc(e.amount), paid_by: meId, paid_on: e.spent_on }
}

export type ConvertStage = 'debt' | 'payment' | 'delete' | 'compensate'

/** `compensate` = el gasto no se pudo borrar Y el pago tampoco se pudo retirar: puede haber doble conteo y hay que avisarlo. */
export class ConvertError extends Error {
  readonly stage: ConvertStage
  constructor(stage: ConvertStage) {
    super(`No se pudo pasar el gasto a pago de deuda (${stage})`)
    this.stage = stage
  }
}

export interface ConvertDeps {
  /** Solo si la deuda es nueva; true = quedó creada */
  createDebt?: () => Promise<boolean>
  /** true = quedó guardado (o ya existía) */
  insertPayment: () => Promise<boolean>
  deleteExpense: () => Promise<void>
  /** Retira el pago recién creado (compensación) */
  deletePayment: () => Promise<void>
}

/**
 * Orden seguro: deuda (si es nueva) -> pago -> borrar gasto. El gasto solo se borra si el pago salió bien; si el borrado
 * falla se retira el pago. Siempre hay uno de los dos, nunca ninguno ni los dos (salvo `compensate`, que se avisa).
 */
export async function convertExpenseToDebtPayment(deps: ConvertDeps): Promise<void> {
  if (deps.createDebt && !(await deps.createDebt().catch(() => false))) throw new ConvertError('debt')
  if (!(await deps.insertPayment().catch(() => false))) throw new ConvertError('payment')
  try {
    await deps.deleteExpense()
  } catch {
    try {
      await deps.deletePayment()
    } catch {
      throw new ConvertError('compensate')
    }
    throw new ConvertError('delete')
  }
}

export interface UndoDeps {
  reinsertExpense: () => Promise<boolean>
  deletePayment: () => Promise<void>
}

/** Deshacer: primero vuelve el gasto y recién entonces se quita el pago (si falla la vuelta, el pago queda y nada se pierde). */
export async function undoExpenseToDebt(deps: UndoDeps): Promise<void> {
  if (!(await deps.reinsertExpense().catch(() => false))) throw new Error('No se pudo devolver el gasto')
  await deps.deletePayment()
}
