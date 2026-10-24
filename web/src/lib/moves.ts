import type { Expense } from './data'

export interface DayGroup {
  date: string
  total: number
  items: Expense[]
}

/** Agrupa los gastos por día, del más reciente al más antiguo */
export function groupByDay(expenses: Expense[]): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const e of expenses) {
    const g = map.get(e.spent_on) ?? { date: e.spent_on, total: 0, items: [] }
    g.total += e.amount
    g.items.push(e)
    map.set(e.spent_on, g)
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export interface WhereItem {
  label: string
  total: number
  count: number
}

/** En qué se fue la plata de una categoría: gastos agrupados por nota (o «Sin detalle») */
export function whereItWent(expenses: Expense[]): WhereItem[] {
  const map = new Map<string, WhereItem>()
  for (const e of expenses) {
    const raw = e.note?.trim() ?? ''
    const key = raw.toLowerCase()
    const cur = map.get(key) ?? { label: raw || 'Sin detalle', total: 0, count: 0 }
    cur.total += e.amount
    cur.count += 1
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}
