// Copyright (c) 2026 Dinovance
// Ingresos y pagos de tarjeta detectados: filas a guardar y flujo «guardar y recién entonces quitar el borrador». Lógica pura.
import { localDate } from './candidates'
import { draftExpenseId } from './draftExpenseId'
import type { NativeDraft } from './nativeBridge'

export const INCOME_SOURCE = 'Transferencia recibida'

export interface IncomeRow {
  id: string
  household_id: string
  amount: number
  source: string
  received_on: string
}

export interface DebtPaymentRow {
  id: string
  household_id: string
  debt_id: string
  amount: number
  paid_by: string
  paid_on: string
}

/** Id estable por borrador: reenviar tras un corte nunca duplica (la base lo reconoce como ya guardado). */
/** Fecha (Santiago) del AVISO, no del toque en Guardar; si el borrador no la trae, hoy en Chile. */
const noticeDay = (d: NativeDraft, now: number): string => localDate(Number.isFinite(d.postedAtMillis) && d.postedAtMillis > 0 ? d.postedAtMillis : now)

export function incomeRow(householdId: string, d: NativeDraft, now: number = Date.now()): IncomeRow {
  return { id: draftExpenseId(d.id), household_id: householdId, amount: Math.trunc(d.amountClp), source: INCOME_SOURCE, received_on: noticeDay(d, now) }
}

export function debtPaymentRow(householdId: string, d: NativeDraft, debtId: string, meId: string, now: number = Date.now()): DebtPaymentRow {
  return { id: draftExpenseId(d.id), household_id: householdId, debt_id: debtId, amount: Math.trunc(d.amountClp), paid_by: meId, paid_on: noticeDay(d, now) }
}

export interface FinishDeps {
  /** true si quedó guardado */
  insert: () => Promise<boolean>
  removeDraft: (id: string) => Promise<void>
  /** Un fallo al quitar el borrador no desguarda nada: se avisa al registro de errores */
  onRemoveError?: (e: unknown) => void
}

/**
 * Guarda y SOLO si salió bien quita el borrador. Si el guardado falla lanza y el borrador queda intacto.
 * Solo ingresos y pagos de tarjeta: cualquier otro tipo se rechaza sin tocar nada.
 */
export async function saveMovement(d: NativeDraft, allowed: NativeDraft['kind'], deps: FinishDeps): Promise<void> {
  if (d.kind !== allowed) throw new Error('Tipo de movimiento no permitido')
  if (!(await deps.insert())) throw new Error('No se pudo guardar')
  try {
    await deps.removeDraft(d.id)
  } catch (e) {
    deps.onRemoveError?.(e)
  }
}
