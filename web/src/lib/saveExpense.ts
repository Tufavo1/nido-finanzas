// Copyright (c) 2026 Dinovance
import { isTransient, saveOnce } from './idempotency'
import type { WriteResult } from './idempotency'
import type { ExpenseRow } from './inbox'
import { supabase } from './supabase'

export interface InsertOutcome {
  ok: boolean
  /** Falla pasajera (sin red, servidor caído): conviene dejarlo en la cola y reintentar */
  transient: boolean
}

/** Sin respuesta del servidor (estado 0) y sin código de la base: es la red, no el dato */
const offline = (r: WriteResult): boolean => r.status === 0 && !!r.error && !r.error.code

/** Guarda un gasto con su id (reintenta fallas pasajeras; «ya existía» cuenta como guardado). */
export async function insertExpenseRow(row: ExpenseRow): Promise<InsertOutcome> {
  let last: WriteResult | undefined
  const r = await saveOnce(async () => {
    last = await supabase.from('expenses').insert(row)
    return last
  })
  return { ok: r.ok, transient: !r.ok && !!last && (isTransient(last) || offline(last)) }
}

/** Deshacer: borra el gasto recién guardado. */
export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

/**
 * Borrado que exige haber borrado de verdad: con RLS, borrar una fila ajena (o ya borrada) NO da error, solo 0 filas.
 * Lo usa «Fue pago de una deuda»: si el gasto no se borro, la conversion debe fallar y retirar el pago (sin doble conteo).
 */
export async function deleteExpenseStrict(id: string): Promise<void> {
  const { data, error } = await supabase.from('expenses').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length !== 1) throw new Error('El gasto no se borró')
}
