import type { Finding } from './finance'
import { money } from './format'
import { monthKey } from './analysis'
import { monthName } from './ui'

/** Análisis de gastos: detecta lo que se sale de lo normal (gastos inusuales, posibles duplicados, suscripciones sin marcar) y cómo va cada presupuesto. */

export interface ExpRow {
  id: string
  amount: number
  shared: boolean
  paid_by: string
  category_id: string
  spent_on: string
  note: string | null
  recurring_id: string | null
}

export interface ExpenseInput {
  /** Gastos del hogar de los últimos meses, incluido el elegido */
  history: ExpRow[]
  month: Date
  now?: Date
  categories: { id: string; name: string; monthly_budget: number }[]
  /** Gastos fijos activos (para no sugerir como fijo algo que ya lo es) */
  recurring: { note: string; active: boolean }[]
  /** 'all' o el id de una persona: se analiza lo que pagó */
  who: string
}

export interface Unusual {
  id: string
  label: string
  amount: number
  category: string
  /** Lo normal en esa categoría (mediana de los meses anteriores) */
  typical: number
  date: string
}

export interface Duplicate {
  label: string
  amount: number
  category: string
  dates: string[]
}

export interface SubscriptionHint {
  label: string
  amount: number
  months: number
  category: string
}

export interface BudgetPace {
  id: string
  name: string
  spent: number
  budget: number
  /** Cierre estimado del mes con el ritmo actual */
  projected: number
  status: 'over' | 'will' | 'ok'
  /** Día del mes en que se acaba el tope a este ritmo (solo si todavía no se pasa) */
  hitDay: number | null
}

export interface TopExpense {
  label: string
  amount: number
  category: string
  date: string
}

export interface Rhythm {
  /** Días del mes con al menos un gasto, frente a los días que van */
  spendDays: number
  elapsed: number
  /** Días seguidos sin gastar hasta hoy (mes en curso) */
  quietStreak: number
  avgTicket: number
  count: number
  /** Parte de lo gastado que cae en sábado y domingo */
  weekendPct: number | null
  /** Parte de lo gastado en los primeros 10 días del mes */
  earlyPct: number | null
}

export interface ExpenseInsights {
  hasData: boolean
  unusual: Unusual[]
  duplicates: Duplicate[]
  subscriptions: SubscriptionHint[]
  pace: BudgetPace[]
  top: TopExpense[]
  rhythm: Rhythm | null
  findings: Finding[]
}

const MIN_HISTORY_FOR_NORMAL = 4
const UNUSUAL_FACTOR = 3
const UNUSUAL_MIN_EXTRA = 30_000
const UNUSUAL_MIN = 20_000
const DUP_MIN = 3_000
const SUB_MIN_MONTHS = 3
// Una suscripción cobra prácticamente lo mismo cada mes; las compras del súper o la bencina varían bastante más
const SUB_TOLERANCE = 0.03
const WEEKEND_LIMIT = 45
const EARLY_LIMIT = 55

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2
}
const norm = (note: string | null) =>
  (note ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const dayOf = (iso: string) => Number(iso.slice(8, 10))
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00`) - Date.parse(`${b}T00:00:00`)) / 86_400_000
const shortISO = (iso: string) => `${dayOf(iso)} de ${monthName(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1))}`

export function analyzeExpenses(input: ExpenseInput): ExpenseInsights {
  const { month, categories, who } = input
  const now = input.now ?? new Date()
  const key = monthKey(month)
  const isCurrent = key === monthKey(now)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const elapsed = isCurrent ? now.getDate() : days
  const catName = new Map(categories.map((c) => [c.id, c.name] as const))
  const nameOf = (id: string) => catName.get(id) ?? 'Otra categoría'

  const all = input.history.filter((e) => who === 'all' || e.paid_by === who)
  const cur = all.filter((e) => e.spent_on.startsWith(key))
  const prior = all.filter((e) => e.spent_on.slice(0, 7) < key)
  const label = (e: ExpRow) => e.note?.trim() || nameOf(e.category_id)

  // ---------- Gastos inusuales: muy por encima de lo normal de su categoría ----------
  const typical = new Map<string, number>()
  const byCat = new Map<string, number[]>()
  for (const e of prior) if (!e.recurring_id) byCat.set(e.category_id, [...(byCat.get(e.category_id) ?? []), e.amount])
  for (const [id, xs] of byCat) if (xs.length >= MIN_HISTORY_FOR_NORMAL) typical.set(id, median(xs))
  const unusual: Unusual[] = cur
    .filter((e) => !e.recurring_id && e.amount >= UNUSUAL_MIN)
    .flatMap((e) => {
      const t = typical.get(e.category_id)
      return t !== undefined && e.amount >= t * UNUSUAL_FACTOR && e.amount - t >= UNUSUAL_MIN_EXTRA
        ? [{ id: e.id, label: label(e), amount: e.amount, category: nameOf(e.category_id), typical: Math.round(t), date: e.spent_on }]
        : []
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  // ---------- Posibles duplicados: mismo monto, categoría y persona en días seguidos ----------
  const duplicates: Duplicate[] = []
  const seen = new Set<string>()
  const manual = cur.filter((e) => !e.recurring_id && e.amount >= DUP_MIN).sort((a, b) => a.spent_on.localeCompare(b.spent_on))
  for (let i = 0; i < manual.length; i++) {
    const a = manual[i]!
    if (seen.has(a.id)) continue
    const twins = manual.filter((b, j) => j > i && !seen.has(b.id) && b.amount === a.amount && b.category_id === a.category_id && b.paid_by === a.paid_by && dayDiff(a.spent_on, b.spent_on) <= 1)
    if (twins.length === 0) continue
    seen.add(a.id)
    for (const t of twins) seen.add(t.id)
    duplicates.push({ label: label(a), amount: a.amount, category: nameOf(a.category_id), dates: [a.spent_on, ...twins.map((t) => t.spent_on)] })
  }
  duplicates.splice(3)

  // ---------- Suscripciones sin marcar como fijas: misma nota y monto parecido varios meses ----------
  const knownFixed = new Set(input.recurring.filter((r) => r.active).map((r) => norm(r.note)))
  const groups = new Map<string, ExpRow[]>()
  for (const e of all) {
    const n = norm(e.note)
    if (n.length < 3 || e.recurring_id) continue
    groups.set(`${n}|${e.category_id}`, [...(groups.get(`${n}|${e.category_id}`) ?? []), e])
  }
  const subscriptions: SubscriptionHint[] = []
  for (const [k, list] of groups) {
    const n = k.split('|')[0] ?? ''
    if (knownFixed.has(n)) continue
    const monthsSeen = new Set(list.map((e) => e.spent_on.slice(0, 7)))
    if (monthsSeen.size < SUB_MIN_MONTHS) continue
    const m = median(list.map((e) => e.amount))
    const near = list.filter((e) => Math.abs(e.amount - m) <= m * SUB_TOLERANCE)
    if (new Set(near.map((e) => e.spent_on.slice(0, 7))).size < SUB_MIN_MONTHS) continue
    const latest = near.reduce((x, y) => (y.spent_on > x.spent_on ? y : x))
    subscriptions.push({ label: latest.note?.trim() ?? n, amount: Math.round(m), months: monthsSeen.size, category: nameOf(latest.category_id) })
  }
  subscriptions.sort((a, b) => b.amount - a.amount)
  subscriptions.splice(3)

  // ---------- Ritmo frente a cada presupuesto (los topes son del hogar) ----------
  const pace: BudgetPace[] = []
  if (who === 'all') {
    for (const c of categories) {
      if (c.monthly_budget <= 0) continue
      const spent = cur.filter((e) => e.category_id === c.id).reduce((s, e) => s + e.amount, 0)
      const projected = isCurrent && elapsed >= 5 ? Math.round((spent / elapsed) * days) : spent
      const status: BudgetPace['status'] = spent > c.monthly_budget ? 'over' : isCurrent && projected > c.monthly_budget ? 'will' : 'ok'
      const hitDay = status === 'will' && spent > 0 ? Math.min(days, Math.max(elapsed, Math.ceil((c.monthly_budget / spent) * elapsed))) : null
      if (spent > 0) pace.push({ id: c.id, name: c.name, spent, budget: c.monthly_budget, projected, status, hitDay })
    }
    const rank = { over: 0, will: 1, ok: 2 } as const
    pace.sort((a, b) => rank[a.status] - rank[b.status] || b.spent / b.budget - a.spent / a.budget)
  }

  // ---------- Mayores gastos ----------
  const top: TopExpense[] = [...cur]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((e) => ({ label: label(e), amount: e.amount, category: nameOf(e.category_id), date: e.spent_on }))

  // ---------- Ritmo y hábitos ----------
  let rhythm: Rhythm | null = null
  if (cur.length > 0) {
    const total = cur.reduce((s, e) => s + e.amount, 0)
    const daysWith = new Set(cur.map((e) => dayOf(e.spent_on)))
    let quietStreak = 0
    if (isCurrent) for (let d = now.getDate(); d >= 1 && !daysWith.has(d); d--) quietStreak++
    const weekend = cur.filter((e) => {
      const g = new Date(Number(e.spent_on.slice(0, 4)), Number(e.spent_on.slice(5, 7)) - 1, dayOf(e.spent_on)).getDay()
      return g === 0 || g === 6
    })
    const early = cur.filter((e) => dayOf(e.spent_on) <= 10)
    const enough = cur.length >= 8
    rhythm = {
      spendDays: daysWith.size,
      elapsed,
      quietStreak,
      avgTicket: Math.round(total / cur.length),
      count: cur.length,
      weekendPct: enough && total > 0 ? Math.round((weekend.reduce((s, e) => s + e.amount, 0) * 100) / total) : null,
      earlyPct: enough && (!isCurrent || elapsed > 10) && total > 0 ? Math.round((early.reduce((s, e) => s + e.amount, 0) * 100) / total) : null,
    }
  }

  // ---------- Conclusiones ----------
  const findings: Finding[] = []
  for (const p of pace.filter((x) => x.status === 'over').slice(0, 2)) {
    findings.push({ level: 'bad', title: `**${p.name}** ya se pasó del tope`, detail: `Llevan ${money(p.spent)} de ${money(p.budget)} (${money(p.spent - p.budget)} de más).` })
  }
  for (const p of pace.filter((x) => x.status === 'will').slice(0, 2)) {
    findings.push({
      level: 'warn',
      title: `**${p.name}** se acabaría el día ${p.hitDay ?? ''}`,
      detail: `A este ritmo cierran en ${money(p.projected)} y el tope es ${money(p.budget)}. Frenen un poco para llegar a fin de mes.`,
    })
  }
  for (const u of unusual.slice(0, 2)) {
    findings.push({ level: 'warn', title: `**${u.label}** (${money(u.amount)}) es un gasto fuera de lo normal`, detail: `En ${u.category} lo típico es ${money(u.typical)}. Revisa que el monto esté bien anotado.` })
  }
  for (const d of duplicates.slice(0, 2)) {
    findings.push({ level: 'warn', title: `Posible gasto repetido: **${d.label}**`, detail: `${d.dates.length} gastos de ${money(d.amount)} en ${d.category} (${d.dates.map(shortISO).join(' y ')}). Si fue un error, bórralo.` })
  }
  for (const s of subscriptions.slice(0, 2)) {
    findings.push({ level: 'warn', title: `**${s.label}** parece un gasto fijo`, detail: `Lo pagan casi igual (~${money(s.amount)}) hace ${s.months} meses. Márcalo como fijo en Finanzas para que se anote solo y no se olvide.` })
  }
  if (rhythm?.weekendPct != null && rhythm.weekendPct >= WEEKEND_LIMIT) {
    findings.push({ level: 'warn', title: `El ${rhythm.weekendPct} % de lo gastado cae en fin de semana`, detail: 'Solo son 2 de cada 7 días. Planificar los fines de semana es donde más se puede ajustar.' })
  }
  if (rhythm?.earlyPct != null && rhythm.earlyPct >= EARLY_LIMIT) {
    findings.push({ level: 'warn', title: `El ${rhythm.earlyPct} % se gastó en los primeros 10 días`, detail: 'Gastar casi todo apenas llega la plata deja el resto del mes muy ajustado.' })
  }
  if (rhythm && rhythm.quietStreak >= 3) {
    findings.push({ level: 'ok', title: `Llevan ${rhythm.quietStreak} días sin gastar`, detail: 'Buen ritmo. Los días sin gasto son los que sostienen el presupuesto.' })
  }
  if (pace.length > 0 && pace.every((p) => p.status === 'ok')) {
    findings.push({ level: 'ok', title: 'Todos los presupuestos van bien', detail: 'Ninguna categoría con tope se pasaría a este ritmo.' })
  }
  const rank = { bad: 0, warn: 1, ok: 2 } as const
  findings.sort((a, b) => rank[a.level] - rank[b.level])

  return { hasData: cur.length > 0, unusual, duplicates, subscriptions, pace, top, rhythm, findings }
}
