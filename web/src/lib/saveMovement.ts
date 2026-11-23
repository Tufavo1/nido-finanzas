// Copyright (c) 2026 Dinovance
import { saveOnce } from './idempotency'
import type { DebtPaymentRow, DebtRow, IncomeRow } from './movements'
import { supabase } from './supabase'

/** Guarda un ingreso con su id (reintenta fallas pasajeras; «ya existía» cuenta como guardado). */
export async function insertIncomeRow(row: IncomeRow): Promise<boolean> {
  return (await saveOnce(async () => supabase.from('incomes').insert(row))).ok
}

/** Guarda un pago de deuda con su id (mismas reglas que el ingreso). */
export async function insertDebtPaymentRow(row: DebtPaymentRow): Promise<boolean> {
  return (await saveOnce(async () => supabase.from('debt_payments').insert(row))).ok
}

/** Guarda una deuda nueva con su id (mismas reglas: reintenta y «ya existía» cuenta como guardada). */
export async function insertDebtRow(row: DebtRow): Promise<boolean> {
  return (await saveOnce(async () => supabase.from('debts').insert(row))).ok
}

/** Deshacer un ingreso extra guardado solo: borra esa fila (privada) de incomes. */
export async function deleteIncomeRow(id: string): Promise<void> {
  const { error } = await supabase.from('incomes').delete().eq('id', id)
  if (error) throw error
}

/** Borra un pago de deuda por id (compensación o deshacer). */
export async function deleteDebtPaymentRow(id: string): Promise<void> {
  const { error } = await supabase.from('debt_payments').delete().eq('id', id)
  if (error) throw error
}
