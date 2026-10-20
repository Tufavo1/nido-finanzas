import { toISO } from './format'
import { supabase } from './supabase'
import type { HistExpense } from './analysis'

/** Gastos del hogar de los últimos meses (incluido el elegido). La base corta cada consulta en 1.000 filas: se pide por páginas. */
export async function fetchHistory(householdId: string, month: Date, months = 6): Promise<HistExpense[]> {
  const start = toISO(new Date(month.getFullYear(), month.getMonth() - (months - 1), 1))
  const end = toISO(new Date(month.getFullYear(), month.getMonth() + 1, 1))
  const out: HistExpense[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('expenses')
      .select('amount, shared, paid_by, category_id, spent_on')
      .eq('household_id', householdId)
      .gte('spent_on', start)
      .lt('spent_on', end)
      .order('spent_on')
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}
