import type { Debt, DebtPayment, Recurring } from './data'
import { analyzeSalary, monthIncome, myDebtShare, summarizeDebts } from './finance'
import type { Finding, Level } from './finance'
import { money } from './format'
import { monthName, monthShort } from './ui'

/** Análisis personal: qué gastas, en qué, cómo vas y qué puedes mejorar. Todo se calcula con tus propios datos. */

export interface HistExpense {
  amount: number
  shared: boolean
  paid_by: string
  category_id: string
  spent_on: string
}

export interface AnalysisInput {
  meId: string
  memberCount: number
  month: Date
  now?: Date
  /** Gastos del hogar de los últimos meses, incluido el elegido */
  history: HistExpense[]
  categories: { id: string; name: string; monthly_budget: number }[]
  salary: { amount: number } | null
  /** Ingresos extra del mes elegido */
  incomes: { amount: number }[]
  debts: Debt[]
  debtPayments: DebtPayment[]
  contributions: { user_id: string; amount: number }[]
  recurring: Recurring[]
}

export interface CategorySlice {
  id: string
  name: string
  amount: number
  /** Parte de tu gasto del mes (0 a 100) */
  pct: number
}

export interface MonthBar {
  key: string
  label: string
  amount: number
  current: boolean
}

export interface ScorePart {
  key: 'ahorro' | 'deudas' | 'presupuesto' | 'colchon'
  label: string
  points: number
  max: number
  level: Level
  detail: string
}

export interface Score {
  value: number
  label: string
  level: Level
  parts: ScorePart[]
}

export interface Rule {
  needs: number
  wants: number
  savings: number
  income: number
}

export interface Analysis {
  hasData: boolean
  /** Tu costo real del mes: lo personal tuyo más tu parte de lo compartido */
  cost: number
  /** Cierre estimado del mes en curso */
  projected: number | null
  income: number
  slices: CategorySlice[]
  months: MonthBar[]
  /** Promedio de tus meses anteriores con gastos */
  avgPrev: number | null
  score: Score | null
  rule: Rule | null
  insights: Finding[]
  summary: string
}

// ---------- Umbrales (todos en un solo lugar) ----------
const WINDOW_MONTHS = 6
const SMALL_EXPENSE = 8_000
const SMALL_MIN_COUNT = 8
const SMALL_MIN_TOTAL = 40_000
const JUMP_PCT = 25
const JUMP_MIN_CLP = 15_000
const DOMINANT_SHARE = 40
const FIXED_SHARE_LIMIT = 50

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Lo que de este gasto te toca a ti: lo personal tuyo completo y tu parte de lo compartido. */
export function myShare(e: HistExpense, meId: string, memberCount: number): number {
  if (e.shared) return e.amount / Math.max(memberCount, 1)
  return e.paid_by === meId ? e.amount : 0
}

const HOUSING = /hogar|arriendo|dividendo|cuenta/i
const NEEDS =
  /super|mercado|hogar|cuenta|arriendo|dividendo|luz|agua|gas\b|internet|transport|bencina|combust|salud|farmac|m[eé]dic|educa|colegio|jard[ií]n|seguro|mascota/i

/** Heurística por nombre: las categorías propias que no reconoce cuentan como gustos. */
export const isNeed = (name: string): boolean => NEEDS.test(name)

function scoreLabel(v: number): { label: string; level: Level } {
  if (v >= 80) return { label: 'Excelente', level: 'ok' }
  if (v >= 60) return { label: 'Buena', level: 'ok' }
  if (v >= 40) return { label: 'Ajustada', level: 'warn' }
  return { label: 'En riesgo', level: 'bad' }
}

const RANK: Record<Level, number> = { bad: 0, warn: 1, ok: 2 }

export function buildAnalysis(input: AnalysisInput): Analysis {
  const { meId, memberCount, month, history, categories } = input
  const now = input.now ?? new Date()
  const key = monthKey(month)
  const isCurrent = key === monthKey(now)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const elapsed = isCurrent ? now.getDate() : days
  const catName = new Map(categories.map((c) => [c.id, c.name] as const))

  // Meses de la ventana, del más viejo al elegido
  const keys: string[] = []
  const labels = new Map<string, string>()
  for (let i = WINDOW_MONTHS - 1; i >= 0; i--) {
    const d = new Date(month.getFullYear(), month.getMonth() - i, 1)
    keys.push(monthKey(d))
    labels.set(monthKey(d), monthShort(d))
  }

  const costByMonth = new Map<string, number>(keys.map((k) => [k, 0]))
  const catByMonth = new Map<string, Map<string, number>>() // categoría -> mes -> monto
  const small: number[] = []
  for (const e of history) {
    const k = e.spent_on.slice(0, 7)
    if (!costByMonth.has(k)) continue
    const mine = myShare(e, meId, memberCount)
    if (mine <= 0) continue
    costByMonth.set(k, (costByMonth.get(k) ?? 0) + mine)
    const perMonth = catByMonth.get(e.category_id) ?? new Map<string, number>()
    perMonth.set(k, (perMonth.get(k) ?? 0) + mine)
    catByMonth.set(e.category_id, perMonth)
    if (k === key && mine <= SMALL_EXPENSE) small.push(mine)
  }

  const cost = Math.round(costByMonth.get(key) ?? 0)
  const projected = isCurrent && elapsed >= 5 && cost > 0 ? Math.round((cost / elapsed) * days) : null
  const prevKeys = keys.filter((k) => k < key)
  const prevWithData = prevKeys.filter((k) => (costByMonth.get(k) ?? 0) > 0)
  const avgPrev = prevWithData.length > 0 ? Math.round(sum(prevWithData.map((k) => costByMonth.get(k) ?? 0)) / prevWithData.length) : null

  const months: MonthBar[] = keys.map((k) => ({
    key: k,
    label: labels.get(k) ?? '',
    amount: Math.round(costByMonth.get(k) ?? 0),
    current: k === key,
  }))

  // ---------- En qué se va ----------
  const cats = [...catByMonth.entries()]
    .map(([id, per]) => ({ id, name: catName.get(id) ?? 'Otra categoría', amount: Math.round(per.get(key) ?? 0), per }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const slices: CategorySlice[] = cats.slice(0, 5).map((c) => ({
    id: c.id,
    name: c.name,
    amount: c.amount,
    pct: cost > 0 ? Math.round((c.amount * 100) / cost) : 0,
  }))
  const rest = cats.slice(5).reduce((s, c) => s + c.amount, 0)
  if (rest > 0) slices.push({ id: 'otras', name: 'Otras categorías', amount: rest, pct: cost > 0 ? Math.round((rest * 100) / cost) : 0 })

  // ---------- Ingresos, cuotas y ahorro ----------
  const income = monthIncome(input.salary, input.incomes)
  const commitments = myDebtShare(input.debts, input.debtPayments, meId, memberCount)
  const sal = income > 0 ? analyzeSalary({ income, spent: cost, commitments, month, now }) : null
  const outlookFree = sal ? (sal.projectedFree ?? sal.free) : null
  const savingsPct = sal && outlookFree !== null ? Math.round((outlookFree * 100) / income) : null

  const myContrib = sum(input.contributions.filter((c) => c.user_id === meId).map((c) => c.amount))
  const baseCost = avgPrev ?? (cost > 0 ? cost : 0)
  const monthsCovered = baseCost > 0 ? myContrib / baseCost : null

  // ---------- Puntaje ----------
  let score: Score | null = null
  if (sal && savingsPct !== null) {
    const parts: ScorePart[] = []
    parts.push({
      key: 'ahorro',
      label: 'Ahorro',
      max: 40,
      points: Math.round(clamp(savingsPct / 20, 0, 1) * 40),
      level: savingsPct >= 15 ? 'ok' : savingsPct >= 5 ? 'warn' : 'bad',
      detail:
        savingsPct >= 0
          ? `Te quedaría el ${savingsPct} % de lo que ganas. Lo sano es 20 % o más.`
          : 'Estás gastando más de lo que ganas.',
    })
    parts.push({
      key: 'deudas',
      label: 'Deudas',
      max: 25,
      points: commitments === 0 ? 25 : Math.round(clamp((40 - sal.debtPct) / 25, 0, 1) * 25),
      level: sal.debtPct <= 15 ? 'ok' : sal.debtPct <= 30 ? 'warn' : 'bad',
      detail: commitments === 0 ? 'Sin cuotas de deuda este mes.' : `Tus cuotas son el ${sal.debtPct} % de tu ingreso. Lo recomendable es no pasar de 30 %.`,
    })
    const budgeted = categories.filter((c) => c.monthly_budget > 0)
    if (budgeted.length > 0) {
      const spentHome = new Map<string, number>()
      for (const e of history) if (e.spent_on.startsWith(key)) spentHome.set(e.category_id, (spentHome.get(e.category_id) ?? 0) + e.amount)
      const within = budgeted.filter((c) => (spentHome.get(c.id) ?? 0) <= c.monthly_budget).length
      parts.push({
        key: 'presupuesto',
        label: 'Presupuesto',
        max: 15,
        points: Math.round((within / budgeted.length) * 15),
        level: within === budgeted.length ? 'ok' : within / budgeted.length >= 0.6 ? 'warn' : 'bad',
        detail: `${within} de ${budgeted.length} categorías del hogar están dentro de su presupuesto.`,
      })
    }
    if (monthsCovered !== null) {
      parts.push({
        key: 'colchon',
        label: 'Colchón',
        max: 20,
        points: Math.round(clamp(monthsCovered / 6, 0, 1) * 20),
        level: monthsCovered >= 3 ? 'ok' : monthsCovered >= 1 ? 'warn' : 'bad',
        detail: `Lo que has aportado a metas cubre ${monthsCovered.toFixed(1).replace('.', ',')} meses de tus gastos. Lo ideal son 3 a 6.`,
      })
    }
    const max = sum(parts.map((p) => p.max))
    const value = Math.round((sum(parts.map((p) => p.points)) * 100) / max)
    score = { value, ...scoreLabel(value), parts }
  }

  // ---------- 50 / 30 / 20 ----------
  let rule: Rule | null = null
  if (sal && cost > 0) {
    const factor = projected !== null ? projected / cost : 1
    const needsCats = sum(cats.filter((c) => isNeed(c.name)).map((c) => c.amount)) * factor
    const wantsCats = sum(cats.filter((c) => !isNeed(c.name)).map((c) => c.amount)) * factor
    const needs = Math.round(needsCats + commitments)
    const wants = Math.round(wantsCats)
    rule = { needs, wants, savings: Math.max(0, Math.round(income - needs - wants)), income }
  }

  // ---------- Qué mejorar ----------
  const insights: Finding[] = []
  const top = slices[0]

  if (sal) insights.push(...sal.findings.filter((f) => f.level !== 'ok' || f.title.startsWith('Puedes ahorrar')))
  if (sal && savingsPct !== null && savingsPct < 10 && outlookFree !== null) {
    const gap = Math.max(0, Math.round(income * 0.1 - Math.max(outlookFree, 0)))
    if (gap > 0) {
      insights.push({
        level: 'warn',
        title: `Te faltan ~${money(gap)} al mes para ahorrar el 10 %`,
        detail: top ? `Lo más fácil es empezar por «${top.name}», donde se va el ${top.pct} % de tu gasto.` : 'Revisa tus gastos más grandes.',
      })
    }
  }

  // Categorías que se dispararon (o bajaron) frente a tu mes típico
  for (const c of cats) {
    const prior = prevKeys.map((k) => c.per.get(k) ?? 0).filter((_, i) => (costByMonth.get(prevKeys[i] ?? '') ?? 0) > 0).slice(-3)
    if (prior.length < 2) continue
    const base = sum(prior) / prior.length
    if (base <= 0) continue
    const diff = c.amount - base
    const pct = Math.round((diff * 100) / base)
    if (pct >= JUMP_PCT && diff >= JUMP_MIN_CLP) {
      insights.push({
        level: 'warn',
        title: isCurrent ? `«${c.name}» ya superó tu mes típico` : `«${c.name}» subió ${pct} %`,
        detail: `${isCurrent ? 'Llevas' : 'Gastaste'} ${money(c.amount)} y tu promedio es ${money(Math.round(base))} (${money(Math.round(diff))} más).`,
      })
    } else if (!isCurrent && pct <= -JUMP_PCT && -diff >= JUMP_MIN_CLP) {
      insights.push({
        level: 'ok',
        title: `«${c.name}» bajó ${-pct} %`,
        detail: `Gastaste ${money(c.amount)} frente a tu promedio de ${money(Math.round(base))}. Buen control.`,
      })
    }
  }

  if (top && top.pct >= DOMINANT_SHARE && !HOUSING.test(top.name) && slices.length > 1) {
    insights.push({ level: 'warn', title: `«${top.name}» es el ${top.pct} % de tu gasto`, detail: 'Una sola categoría concentra casi la mitad. Vale la pena revisarla.' })
  }

  const smallTotal = Math.round(sum(small))
  if (small.length >= SMALL_MIN_COUNT && smallTotal >= SMALL_MIN_TOTAL) {
    insights.push({
      level: 'warn',
      title: 'Los gastos chicos se están sumando',
      detail: `${small.length} compras de menos de ${money(SMALL_EXPENSE)} suman ${money(smallTotal)}${cost > 0 ? ` (el ${Math.round((smallTotal * 100) / cost)} % de tu gasto)` : ''}. Recortar la mitad te libera ~${money(Math.round(smallTotal / 2))} al mes.`,
    })
  }

  const fixedMine = sum(
    input.recurring.filter((r) => r.active).map((r) => (r.shared ? r.amount / Math.max(memberCount, 1) : r.paid_by === meId ? r.amount : 0)),
  )
  if (income > 0 && fixedMine > 0) {
    const share = Math.round((fixedMine * 100) / income)
    if (share > FIXED_SHARE_LIMIT) {
      insights.push({ level: 'warn', title: `Tus gastos fijos son el ${share} % de tu ingreso`, detail: 'Con tanto comprometido de antemano queda poco margen para imprevistos.' })
    }
  }

  if (monthsCovered !== null && baseCost > 0) {
    if (monthsCovered < 3) {
      const target = Math.round(baseCost * 3)
      insights.push({
        level: monthsCovered < 1 ? 'bad' : 'warn',
        title: `Tu colchón cubre ${monthsCovered.toFixed(1).replace('.', ',')} meses`,
        detail: `Primera meta: 3 meses de gastos (~${money(target)}). Aportando ~${money(Math.max(1000, Math.round((target - myContrib) / 12)))} al mes la alcanzas en un año.`,
      })
    } else if (monthsCovered >= 6) {
      insights.push({ level: 'ok', title: 'Tienes un colchón sólido', detail: `Lo ahorrado cubre más de ${Math.floor(monthsCovered)} meses de tus gastos.` })
    }
  }

  const closed = months.filter((m) => !m.current && m.amount > 0).slice(-3)
  const first = closed[0]
  const last = closed[closed.length - 1]
  if (closed.length === 3 && first && last && closed[0]!.amount < closed[1]!.amount && closed[1]!.amount < closed[2]!.amount && last.amount >= first.amount * 1.15) {
    insights.push({ level: 'warn', title: 'Tu gasto lleva 3 meses subiendo', detail: `De ${money(first.amount)} a ${money(last.amount)}. Conviene frenarlo antes de que se vuelva costumbre.` })
  }

  if (!isCurrent && avgPrev && cost > 0 && cost <= avgPrev * 0.9) {
    insights.push({ level: 'ok', title: `Gastaste ${Math.round(100 - (cost * 100) / avgPrev)} % menos que tu promedio`, detail: `${money(cost)} frente a ${money(avgPrev)} de tus meses anteriores.` })
  }

  for (const f of summarizeDebts(input.debts, input.debtPayments, now).findings.filter((x) => x.level !== 'ok').slice(0, 2)) insights.push(f)

  insights.sort((a, b) => RANK[a.level] - RANK[b.level])
  if (insights.length === 0 && cost > 0) insights.push({ level: 'ok', title: 'Todo en orden', detail: 'No veo nada que corregir con los datos de este mes.' })

  // ---------- Resumen en lenguaje simple ----------
  const mes = monthName(month)
  let summary: string
  if (cost === 0) {
    summary = isCurrent ? 'Aún no hay gastos tuyos este mes. Cuando registres, aquí aparece la lectura de tu situación.' : `No hay gastos tuyos en ${mes}.`
  } else {
    const parts: string[] = [isCurrent ? `En lo que va de ${mes} tu costo real es ${money(cost)}` : `En ${mes} tu costo real fue ${money(cost)}`]
    if (avgPrev) {
      const d = Math.round(((cost - avgPrev) * 100) / avgPrev)
      if (Math.abs(d) >= 3 && !isCurrent) parts.push(`${Math.abs(d)} % ${d > 0 ? 'más' : 'menos'} que tu promedio de ${money(avgPrev)}`)
    }
    if (income > 0) parts.push(`el ${Math.round((cost * 100) / income)} % de lo que ganas`)
    summary = `${parts.join(', ')}.`
    if (projected !== null) {
      summary += ` A este ritmo cerrarás cerca de ${money(projected)}`
      summary += outlookFree !== null ? (outlookFree >= 0 ? ` y te sobrarían ~${money(Math.round(outlookFree))}.` : ` y te faltarían ~${money(Math.round(-outlookFree))}.`) : '.'
    }
  }

  return { hasData: cost > 0 || months.some((m) => m.amount > 0), cost, projected, income, slices, months, avgPrev, score, rule, insights, summary }
}
