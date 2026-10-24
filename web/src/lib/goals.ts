export type GoalState = 'done' | 'ontrack' | 'behind' | 'overdue' | 'open'

export interface GoalProgress {
  saved: number
  remaining: number
  pct: number
  state: GoalState
  /** Meses que quedan hasta la fecha objetivo (mínimo 1); null si no tiene fecha */
  monthsLeft: number | null
  /** Aporte mensual que hace falta para llegar a tiempo; null si no aplica */
  perMonth: number | null
  /** Lo aportado en los últimos 30 días */
  recent: number
}

const DAY = 86400000

/** Estado de una meta con las mismas reglas que usa el motor de avisos */
export function goalProgress(
  target: number,
  targetDate: string | null,
  contributions: { amount: number; contributed_on: string }[],
  now: Date = new Date(),
): GoalProgress {
  const saved = contributions.reduce((s, c) => s + c.amount, 0)
  const remaining = Math.max(0, target - saved)
  const pct = target > 0 ? Math.min(100, Math.floor((saved * 100) / target)) : 0
  const since = new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10)
  const recent = contributions.filter((c) => c.contributed_on >= since).reduce((s, c) => s + c.amount, 0)

  if (remaining === 0) return { saved, remaining, pct: 100, state: 'done', monthsLeft: null, perMonth: null, recent }
  if (!targetDate) return { saved, remaining, pct, state: 'open', monthsLeft: null, perMonth: null, recent }

  const msLeft = Date.parse(targetDate) - now.getTime()
  if (msLeft < -DAY) return { saved, remaining, pct, state: 'overdue', monthsLeft: null, perMonth: null, recent }
  const monthsLeft = Math.max(1, Math.ceil(msLeft / (30 * DAY)))
  const perMonth = Math.ceil(remaining / monthsLeft)
  const state: GoalState = recent < perMonth * 0.6 ? 'behind' : 'ontrack'
  return { saved, remaining, pct, state, monthsLeft, perMonth, recent }
}
