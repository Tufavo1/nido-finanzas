import type { Contribution, Debt, DebtPayment, Recurring } from './data'
import { fraction, portion } from './split'
import type { Split } from './split'

/**
 * A quién se le muestran los datos. 'all' es el hogar entero (el total de los dos) y cualquier otro valor
 * es el id de una persona: lo que le corresponde a ella, sin importar quién pagó.
 */
export type Scope = 'all' | string

/** Una copia con solo la parte de la persona; `fullAmount` es el monto completo original */
export type Scoped<T> = T & { fullAmount?: number }

/** Si la persona elegida ya no está en el hogar, vuelve a mostrar el hogar */
export function resolveScope(scope: Scope, members: { user_id: string }[]): Scope {
  return scope === 'all' || members.some((m) => m.user_id === scope) ? scope : 'all'
}

/**
 * Gastos que le corresponden a una persona: lo personal que ella pagó completo y su parte de todo lo compartido,
 * aunque lo haya pagado la otra persona. Lo compartido queda como compartido, con su parte como monto.
 */
export function scopeExpenses<T extends { amount: number; shared: boolean; paid_by: string }>(list: T[], scope: Scope, split: Split): Scoped<T>[] {
  if (scope === 'all') return list
  const out: Scoped<T>[] = []
  for (const e of list) {
    if (e.shared) out.push({ ...e, amount: Math.round(portion(e.amount, split, scope)), fullAmount: e.amount })
    else if (e.paid_by === scope) out.push(e)
  }
  return out
}

/** Gastos fijos de una persona: lo que paga ella y su parte de los compartidos, con el monto que le toca */
export function scopeRecurring(list: Recurring[], scope: Scope, split: Split): Scoped<Recurring>[] {
  if (scope === 'all') return list
  const out: Scoped<Recurring>[] = []
  for (const r of list) {
    if (r.shared) out.push({ ...r, amount: Math.round(portion(r.amount, split, scope)), fullAmount: r.amount })
    else if (r.paid_by === scope) out.push(r)
  }
  return out
}

/** Las deudas que le tocan a una persona: las suyas y las de los dos */
export const scopeDebts = (list: Debt[], scope: Scope): Debt[] => (scope === 'all' ? list : list.filter((d) => d.owner_id === scope || d.owner_id === null))

/** Lo mismo, pero con solo la parte de la persona en las deudas de los dos (monto, cuota y pagos), para sumar y analizar */
export function scopeDebtShares(debts: Debt[], payments: DebtPayment[], scope: Scope, split: Split): { debts: Debt[]; payments: DebtPayment[] } {
  if (scope === 'all') return { debts, payments }
  const f = fraction(split, scope)
  const mine = scopeDebts(debts, scope)
  const shared = new Set(mine.filter((d) => d.owner_id === null).map((d) => d.id))
  return {
    debts: mine.map((d) => (shared.has(d.id) ? { ...d, original_amount: Math.round(d.original_amount * f), monthly_payment: Math.round(d.monthly_payment * f) } : d)),
    payments: payments.filter((p) => mine.some((d) => d.id === p.debt_id)).map((p) => (shared.has(p.debt_id) ? { ...p, amount: Math.round(p.amount * f) } : p)),
  }
}

/** Aportes a metas de una persona */
export const scopeContributions = (list: Contribution[], scope: Scope): Contribution[] => (scope === 'all' ? list : list.filter((c) => c.user_id === scope))
