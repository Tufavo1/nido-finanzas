import type { Debt, DebtPayment, Recurring } from './data'
import { analyzeSalary, salaryFlows } from './finance'
import { money } from './format'
import type { PaidExpense } from './finance'
import { portion } from './split'
import type { Split } from './split'
import { pendingFixedThisMonth } from './upcoming'

/**
 * Una sola fuente de verdad para las cifras del mes: Inicio, Gastos y Análisis las piden aquí
 * (costo real, categorías, «te queda») para que nunca digan cosas distintas.
 */

export const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Lo que de este gasto te toca a ti: lo personal tuyo completo y tu parte de lo compartido (en pesos enteros, igual que `scopeExpenses`). */
export function myShare(e: { amount: number; shared: boolean; paid_by: string }, meId: string, memberCount: Split): number {
  if (e.shared) return Math.round(portion(e.amount, memberCount, meId))
  return e.paid_by === meId ? e.amount : 0
}

/** Tu costo real de los gastos dados (redondeado una sola vez, al final) */
export function myMonthCost(expenses: { amount: number; shared: boolean; paid_by: string }[], meId: string, split: Split): number {
  return Math.round(expenses.reduce((s, e) => s + myShare(e, meId, split), 0))
}

/** Gastos cuya categoría ya no existe (eliminada o archivada): van juntos en una sola línea */
export const REMOVED_CATEGORY_ID = 'categoria-eliminada'
export const REMOVED_CATEGORY_NAME = 'Categoría eliminada'

/** La categoría con que se cuenta un gasto: la suya, o la línea de «eliminada» si ya no existe */
export const categoryKey = (id: string, known: { has: (id: string) => boolean }): string => (known.has(id) ? id : REMOVED_CATEGORY_ID)

/** Gasto por categoría: todas las vivas más, si hay, «Categoría eliminada». Siempre suma el total. */
export function groupByCategory(
  expenses: { amount: number; category_id: string }[],
  categories: { id: string; name: string; monthly_budget: number }[],
): { id: string; name: string; spent: number; budget: number }[] {
  const known = new Set(categories.map((c) => c.id))
  const spent = new Map<string, number>()
  for (const e of expenses) {
    const k = categoryKey(e.category_id, known)
    spent.set(k, (spent.get(k) ?? 0) + e.amount)
  }
  const rows = categories.map((c) => ({ id: c.id, name: c.name, spent: spent.get(c.id) ?? 0, budget: c.monthly_budget }))
  const removed = spent.get(REMOVED_CATEGORY_ID) ?? 0
  if (removed > 0) rows.push({ id: REMOVED_CATEGORY_ID, name: REMOVED_CATEGORY_NAME, spent: removed, budget: 0 })
  return rows.sort((a, b) => b.spent - a.spent)
}

type FlowExpense = PaidExpense & { recurring_id?: string | null }

/**
 * «Te queda» del mes: gasto sin las compras con tarjeta, cuotas realmente pagadas y por pagar,
 * fijos que aún vencen y ahorro apartado. Es la cuenta de Inicio, de Análisis y de las alertas.
 */
export function salaryPicture(o: {
  expenses: FlowExpense[]
  /** Compras con tarjeta desde el saldo informado (no solo las del mes) */
  cardExpenses: PaidExpense[]
  debts: Debt[]
  debtPayments: DebtPayment[]
  recurring: Recurring[]
  meId: string
  split: Split
  month: Date
  now?: Date
  income: number
  /** Tu costo real del mes (`myMonthCost`) */
  cost: number
  saved: number
}) {
  const now = o.now ?? new Date()
  const key = monthKey(o.month)
  const isCurrent = key === monthKey(now)
  const flows = salaryFlows({ expenses: o.expenses, cardExpenses: o.cardExpenses, debts: o.debts, debtPayments: o.debtPayments, meId: o.meId, split: o.split, month: o.month, now, trueCost: o.cost })
  const fixedBooked = Math.min(
    o.expenses.reduce((s, e) => (e.recurring_id && e.spent_on.startsWith(key) ? s + myShare(e, o.meId, o.split) : s), 0),
    o.cost,
  )
  const pendingFixed = (isCurrent ? pendingFixedThisMonth(o.recurring, o.meId, o.split, now) : 0) + flows.pendingDebt
  const sal = analyzeSalary({ income: o.income, spent: flows.spent, commitments: flows.commitments, month: o.month, now, pendingFixed, fixedBooked, saved: o.saved })
  return { flows, fixedBooked, pendingFixed, sal }
}

/** El único rótulo de esa cifra, en todas las pantallas y textos de ayuda */
export const LEFT_LABEL = 'Te queda'

/** La cifra de «lo que te queda» que se muestra en todas las pantallas, con su nombre: una sola */
export function salaryLeft(f: { realFree: number }): { label: string; amount: number } {
  return { label: LEFT_LABEL, amount: Math.round(f.realFree) }
}

/**
 * La resta que explica la cifra de arriba, sin cambiar el cálculo: ganas − gastos − cuotas − ahorro − fijos y cuotas por pagar.
 * Solo muestra lo que no es cero.
 */
export function salaryBreakdown(f: { income: number; spent: number; commitments: number; saved: number; pendingFixed: number; realFree: number }): string {
  const parts: [string, number][] = [
    ['Gastos', f.spent],
    ['Cuotas pagadas', f.commitments],
    ['Ahorro apartado', f.saved],
    ['Fijos y cuotas por pagar', f.pendingFixed],
  ]
  const minus = parts.filter(([, n]) => n > 0).map(([label, n]) => ` − ${label} ${money(n)}`)
  const left = salaryLeft(f)
  return `Ganas ${money(f.income)}${minus.join('')} = ${left.label} ${money(left.amount)}`
}
