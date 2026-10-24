import type { Analysis, AnalysisInput } from './analysis'
import { monthKey, myShare } from './analysis'
import { analyzeSalary, debtView, myDebtShare, summarizeDebts } from './finance'
import { monthName } from './ui'

/** Números extra del análisis personal: cada uno responde una pregunta simple («¿cuánto me sobra?», «¿qué cambió?»). */

export interface Flow {
  income: number
  spent: number
  commitments: number
  /** Lo que queda hoy después de gastos y cuotas */
  free: number
  /** Cierre estimado del mes (mes en curso con datos suficientes); si no, lo que queda */
  outlook: number
  /** Parte del ingreso que se ahorraría (puede ser negativa) */
  savingsPct: number
  dailyAvg: number
  safeDaily: number | null
  /** De cada $100 que entran: cuánto se va en gastos, en cuotas y cuánto sobra (sobra no baja de 0) */
  per100: { spent: number; debts: number; left: number }
  /** Los gastos y las cuotas superan el ingreso */
  over: boolean
  elapsed: number
  days: number
}

export interface ChangeItem {
  name: string
  now: number
  before: number
  diff: number
  /** Null si antes era cero */
  pct: number | null
}

export interface Changes {
  /** «hasta el día 20 de septiembre» o «en agosto» */
  label: string
  before: number
  diff: number
  pct: number | null
  items: ChangeItem[]
}

export interface FixedVar {
  fixed: number
  variable: number
  fixedPct: number
  /** Parte de tu ingreso que ya está comprometida por gastos fijos; null sin ingreso */
  fixedOfIncome: number | null
}

export interface DebtNumbers {
  remaining: number
  /** Lo que pagas al mes en cuotas */
  payment: number
  /** Interés aproximado que se va cada mes */
  interest: number
  /** Cuántos meses de tu ingreso equivale la deuda; null sin ingreso */
  monthsOfIncome: number | null
  /** Meses hasta quedar libre con las cuotas actuales; null si alguna no avanza */
  freeInMonths: number | null
  stuck: boolean
}

export interface Cushion {
  /** Lo que has aportado a metas */
  saved: number
  covered: number
  target3: number
  target6: number
  /** Meses para llegar a 3 y a 6 meses de gastos ahorrando lo que te sobra; null si ya llegaste o no te sobra */
  monthsTo3: number | null
  monthsTo6: number | null
}

export interface HistoryNumbers {
  avg: number
  high: { label: string; amount: number }
  low: { label: string; amount: number }
  /** Últimos 3 meses frente a los anteriores; null si hay pocos meses */
  trendPct: number | null
  yearly: number
}

export interface Weekday {
  name: string
  pct: number
}

export interface Numbers {
  flow: Flow | null
  changes: Changes | null
  fixedVar: FixedVar | null
  debts: DebtNumbers | null
  cushion: Cushion | null
  history: HistoryNumbers | null
  weekday: Weekday | null
}

const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
const MIN_CHANGE_CLP = 5_000
const MIN_WEEKDAY_COUNT = 10
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const pctOf = (n: number, base: number) => (base > 0 ? Math.round((n * 100) / base) : 0)

export function buildNumbers(input: AnalysisInput, a: Analysis): Numbers {
  const { meId, memberCount, month, history } = input
  const now = input.now ?? new Date()
  const key = monthKey(month)
  const isCurrent = key === monthKey(now)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const elapsed = isCurrent ? now.getDate() : days
  const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1)
  const prevKey = monthKey(prevMonth)
  const catName = new Map(input.categories.map((c) => [c.id, c.name] as const))
  const commitments = myDebtShare(input.debts, input.debtPayments, meId, memberCount)
  const income = a.income

  // ---------- Tu mes en números ----------
  let flow: Flow | null = null
  let outlookFree: number | null = null
  if (income > 0) {
    const sal = analyzeSalary({ income, spent: a.cost, commitments, month, now })
    outlookFree = sal.projectedFree ?? sal.free
    const spentPct = pctOf(a.cost, income)
    const debtsPct = pctOf(commitments, income)
    flow = {
      income,
      spent: a.cost,
      commitments,
      free: Math.round(sal.free),
      outlook: Math.round(outlookFree),
      savingsPct: Math.round((outlookFree * 100) / income),
      dailyAvg: elapsed > 0 ? Math.round(a.cost / elapsed) : 0,
      safeDaily: sal.safeDaily,
      per100: { spent: spentPct, debts: debtsPct, left: Math.max(0, 100 - spentPct - debtsPct) },
      over: sal.free < 0,
      elapsed,
      days,
    }
  }

  // ---------- Una sola pasada por tu historial ----------
  const catNow = new Map<string, number>()
  const catPrev = new Map<string, number>()
  let fixed = 0
  const byWeekday = new Array<number>(7).fill(0)
  let weekdayCount = 0
  for (const e of history) {
    const mine = myShare(e, meId, memberCount)
    if (mine <= 0) continue
    const k = e.spent_on.slice(0, 7)
    const day = Number(e.spent_on.slice(8, 10))
    if (k === key) {
      catNow.set(e.category_id, (catNow.get(e.category_id) ?? 0) + mine)
      if (e.recurring_id) fixed += mine
    } else if (k === prevKey && day <= elapsed) {
      // Mes en curso: se compara con el mismo tramo del mes pasado, no con el mes entero
      catPrev.set(e.category_id, (catPrev.get(e.category_id) ?? 0) + mine)
    }
    const [y, m, d] = e.spent_on.split('-').map(Number)
    byWeekday[new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getDay()]! += mine
    weekdayCount++
  }

  // ---------- Frente al mes pasado ----------
  let changes: Changes | null = null
  const before = Math.round(sum([...catPrev.values()]))
  if (a.cost > 0 && before > 0) {
    const ids = new Set([...catNow.keys(), ...catPrev.keys()])
    const items: ChangeItem[] = [...ids]
      .map((id) => {
        const n = Math.round(catNow.get(id) ?? 0)
        const b = Math.round(catPrev.get(id) ?? 0)
        return { name: catName.get(id) ?? 'Otra categoría', now: n, before: b, diff: n - b, pct: b > 0 ? Math.round(((n - b) * 100) / b) : null }
      })
      .filter((c) => Math.abs(c.diff) >= MIN_CHANGE_CLP)
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
      .slice(0, 5)
    const diff = a.cost - before
    changes = {
      label: isCurrent ? `hasta el día ${elapsed} de ${monthName(prevMonth)}` : `en ${monthName(prevMonth)}`,
      before,
      diff,
      pct: Math.round((diff * 100) / before),
      items,
    }
  }

  // ---------- Fijos y variables ----------
  let fixedVar: FixedVar | null = null
  if (a.cost > 0 && fixed > 0) {
    const f = Math.min(Math.round(fixed), a.cost)
    fixedVar = { fixed: f, variable: a.cost - f, fixedPct: pctOf(f, a.cost), fixedOfIncome: income > 0 ? pctOf(f, income) : null }
  }

  // ---------- Deudas ----------
  let debts: DebtNumbers | null = null
  const mine = input.debts.filter((d) => debtView(d, input.debtPayments, now).remaining > 0 && (d.owner_id === meId || d.owner_id === null))
  if (mine.length > 0) {
    let remaining = 0
    let interest = 0
    for (const d of mine) {
      const share = d.owner_id === meId ? 1 : 1 / Math.max(memberCount, 1)
      const v = debtView(d, input.debtPayments, now)
      remaining += v.remaining * share
      interest += v.monthlyInterest * share
    }
    const sm = summarizeDebts(mine, input.debtPayments, now)
    debts = {
      remaining: Math.round(remaining),
      payment: commitments,
      interest: Math.round(interest),
      monthsOfIncome: income > 0 ? Math.round((remaining / income) * 10) / 10 : null,
      freeInMonths: sm.freeInMonths,
      stuck: sm.freeInMonths === null,
    }
  }

  // ---------- Colchón (ahorro para imprevistos) ----------
  let cushion: Cushion | null = null
  const baseCost = a.avgPrev ?? a.cost
  if (baseCost > 0) {
    const saved = Math.round(sum(input.contributions.filter((c) => c.user_id === meId).map((c) => c.amount)))
    const monthly = outlookFree !== null && outlookFree > 0 ? outlookFree : 0
    const target3 = Math.round(baseCost * 3)
    const target6 = Math.round(baseCost * 6)
    const months = (target: number) => (saved >= target || monthly <= 0 ? null : Math.ceil((target - saved) / monthly))
    cushion = { saved, covered: saved / baseCost, target3, target6, monthsTo3: months(target3), monthsTo6: months(target6) }
  }

  // ---------- Tus meses en números ----------
  let hist: HistoryNumbers | null = null
  const done = a.months.filter((m) => m.amount > 0 && !(m.current && isCurrent))
  if (done.length >= 2) {
    const avg = Math.round(sum(done.map((m) => m.amount)) / done.length)
    const high = done.reduce((x, y) => (y.amount > x.amount ? y : x))
    const low = done.reduce((x, y) => (y.amount < x.amount ? y : x))
    const last = done.slice(-3)
    const earlier = done.slice(0, -3)
    const lastAvg = sum(last.map((m) => m.amount)) / last.length
    const earlierAvg = earlier.length > 0 ? sum(earlier.map((m) => m.amount)) / earlier.length : 0
    hist = {
      avg,
      high: { label: high.label, amount: high.amount },
      low: { label: low.label, amount: low.amount },
      trendPct: earlierAvg > 0 ? Math.round(((lastAvg - earlierAvg) * 100) / earlierAvg) : null,
      yearly: avg * 12,
    }
  }

  // ---------- Día de la semana con más gasto ----------
  let weekday: Weekday | null = null
  const total = sum(byWeekday)
  if (weekdayCount >= MIN_WEEKDAY_COUNT && total > 0) {
    const top = byWeekday.reduce((best, v, i) => (v > (byWeekday[best] ?? 0) ? i : best), 0)
    weekday = { name: WEEKDAYS[top] ?? '', pct: pctOf(byWeekday[top] ?? 0, total) }
  }

  return { flow, changes, fixedVar, debts, cushion, history: hist, weekday }
}
