// Copyright (c) 2026 Dinovance
import { saveOnce } from './idempotency'
import type { DebtPaymentRow, IncomeRow } from './movements'
import { supabase } from './supabase'

/** Guarda un ingreso con su id (reintenta fallas pasajeras; «ya existía» cuenta como guardado). */
export async function insertIncomeRow(row: IncomeRow): Promise<boolean> {
  return (await saveOnce(async () => supabase.from('incomes').insert(row))).ok
}

/** Guarda un pago de deuda con su id (mismas reglas que el ingreso). */
export async function insertDebtPaymentRow(row: DebtPaymentRow): Promise<boolean> {
  return (await saveOnce(async () => supabase.from('debt_payments').insert(row))).ok
}
