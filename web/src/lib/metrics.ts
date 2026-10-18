import type { Category, Expense } from './data'
import type { Member } from './ui'

export interface PersonStats {
  userId: string
  name: string
  color: string
  paid: number
  paidShared: number
  paidPersonal: number
  /** Su mitad (parte justa) de lo compartido */
  fairShare: number
  /** Gastos personales + su parte de lo compartido */
  trueCost: number
  /** Positivo: le deben. Negativo: debe. */
  balance: number
}

export interface CategoryStat {
  id: string
  name: string
  spent: number
  budget: number
}

export interface Settlement {
  from: PersonStats
  to: PersonStats
  amount: number
}

export interface Metrics {
  total: number
  shared: number
  personal: number
  people: PersonStats[]
  byCategory: CategoryStat[]
  daily: Map<number, number>
  avgPerDay: number
  projection: number | null
  prevTotal: number
  deltaPct: number | null
  settle: Settlement | null
  /** Día del mes con más gasto */
  topDay: { day: number; amount: number } | null
  /** Gasto individual más alto */
  biggest: Expense | null
  /** Cuánto del mes ya pasó (0 a 1); 1 si el mes está cerrado */
  monthProgress: number
  /** Presupuesto total y su avance frente al avance del mes */
  budgetTotal: number
  pace: 'sin-presupuesto' | 'bien' | 'atento' | 'pasado'
}

const dayOf = (iso: string) => Number(iso.slice(8, 10))
const sum = (list: Expense[]) => list.reduce((s, e) => s + e.amount, 0)

export function computeMetrics(
  expenses: Expense[],
  prevExpenses: Expense[],
  categories: Category[],
  members: Member[],
  month: Date,
  now: Date = new Date(),
): Metrics {
  const year = month.getFullYear()
  const mon = month.getMonth()
  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const isCurrent = year === now.getFullYear() && mon === now.getMonth()
  const elapsed = isCurrent ? now.getDate() : daysInMonth

  const total = sum(expenses)
  const shared = sum(expenses.filter((e) => e.shared))
  const personal = total - shared

  const daily = new Map<number, number>()
  const catSpent = new Map<string, number>()
  for (const e of expenses) {
    const d = dayOf(e.spent_on)
    daily.set(d, (daily.get(d) ?? 0) + e.amount)
    catSpent.set(e.category_id, (catSpent.get(e.category_id) ?? 0) + e.amount)
  }

  // Reparto exacto: si queda un peso suelto, va a la primera persona
  const n = Math.max(members.length, 1)
  const base = Math.floor(shared / n)
  let remainder = shared - base * n
  const people: PersonStats[] = members.map((m) => {
    const mine = expenses.filter((e) => e.paid_by === m.user_id)
    const paidShared = sum(mine.filter((e) => e.shared))
    const paidPersonal = sum(mine.filter((e) => !e.shared))
    const fairShare = base + (remainder-- > 0 ? 1 : 0)
    return {
      userId: m.user_id,
      name: m.display_name,
      color: m.color,
      paid: paidShared + paidPersonal,
      paidShared,
      paidPersonal,
      fairShare,
      trueCost: paidPersonal + fairShare,
      balance: paidShared - fairShare,
    }
  })

  let settle: Settlement | null = null
  if (people.length >= 2) {
    const sorted = [...people].sort((a, b) => a.balance - b.balance)
    const debtor = sorted[0]
    const creditor = sorted[sorted.length - 1]
    if (debtor && creditor && creditor.balance > 0) {
      settle = { from: debtor, to: creditor, amount: creditor.balance }
    }
  }

  const cutoff = isCurrent ? now.getDate() : 31
  const prevTotal = sum(prevExpenses.filter((e) => dayOf(e.spent_on) <= cutoff))
  const deltaPct = prevTotal > 0 ? Math.round(((total - prevTotal) * 100) / prevTotal) : null

  const avgPerDay = elapsed > 0 ? Math.round(total / elapsed) : 0
  const projection = isCurrent && elapsed >= 5 ? Math.round((total / elapsed) * daysInMonth) : null

  const byCategory = categories
    .map((c) => ({ id: c.id, name: c.name, spent: catSpent.get(c.id) ?? 0, budget: c.monthly_budget }))
    .sort((a, b) => b.spent - a.spent)

  let topDay: Metrics['topDay'] = null
  for (const [day, amount] of daily) if (!topDay || amount > topDay.amount) topDay = { day, amount }
  const biggest = expenses.reduce<Expense | null>((b, e) => (!b || e.amount > b.amount ? e : b), null)

  const monthProgress = elapsed / daysInMonth
  const budgetTotal = categories.reduce((s, c) => s + c.monthly_budget, 0)
  let pace: Metrics['pace'] = 'sin-presupuesto'
  if (budgetTotal > 0) {
    const used = total / budgetTotal
    pace = used > 1 ? 'pasado' : used > monthProgress + 0.1 ? 'atento' : 'bien'
  }

  return {
    total, shared, personal, people, byCategory, daily, avgPerDay, projection, prevTotal, deltaPct, settle,
    topDay, biggest, monthProgress, budgetTotal, pace,
  }
}