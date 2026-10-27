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

const EMERGENCY = /emergencia|colch[oó]n|imprevisto/i

/** Una meta cuenta como ahorro para imprevistos si su nombre lo dice */
export const isEmergencyGoal = (name: string): boolean => EMERGENCY.test(name)

/** Lo que una persona aportó a metas en un mes (YYYY-MM): es la plata que apartó para ahorrar */
export function savedInMonth(contributions: { user_id: string; amount: number; contributed_on: string }[], userId: string, monthKey: string): number {
  return contributions.reduce((s, c) => (c.user_id === userId && c.contributed_on.startsWith(monthKey) ? s + c.amount : s), 0)
}

/** Lo que una persona lleva ahorrado en las metas de imprevistos */
export function emergencySaved(
  contributions: { user_id: string; goal_id: string; amount: number }[],
  goals: { id: string; name: string }[],
  userId: string,
): number {
  const ids = new Set(goals.filter((g) => isEmergencyGoal(g.name)).map((g) => g.id))
  return contributions.reduce((s, c) => (c.user_id === userId && ids.has(c.goal_id) ? s + c.amount : s), 0)
}
