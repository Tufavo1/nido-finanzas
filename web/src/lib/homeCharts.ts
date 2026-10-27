import { portion } from './split'
import type { Split } from './split'
import type { HistExpense, MonthBar } from './analysis'
import { monthKey } from './analysis'
import { monthShort } from './ui'

/** Datos de los gráficos del Inicio. Todo sale de los gastos que la app ya tiene cargados. */

interface Row {
  amount: number
  spent_on: string
}

export interface CurvePoint {
  day: number
  /** Gastado en el mes hasta ese día; null después de hoy en el mes en curso */
  now: number | null
  /** Gastado hasta ese mismo día del mes anterior */
  prev: number | null
  /** Estimación hacia fin de mes con el ritmo de hoy (solo mes en curso) */
  proj: number | null
}

export interface MonthCurve {
  points: CurvePoint[]
  days: number
  /** Último día con datos: hoy en el mes en curso, o el último día del mes */
  upTo: number
  total: number
  prevTotal: number
  /** Lo que se llevaba gastado el mes pasado a este mismo día */
  prevSame: number
  projected: number | null
}

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const dayOf = (iso: string) => Number(iso.slice(8, 10))
const PROJECT_FROM_DAY = 5

/** Gasto acumulado día a día del mes elegido frente al mes anterior. */
export function monthCurve(current: Row[], previous: Row[], month: Date, now: Date = new Date()): MonthCurve {
  const days = daysIn(month.getFullYear(), month.getMonth())
  const prevDays = daysIn(month.getFullYear(), month.getMonth() - 1)
  const isCurrent = monthKey(month) === monthKey(now)
  const upTo = isCurrent ? Math.min(now.getDate(), days) : days

  const cum = (rows: Row[], n: number) => {
    const per = new Array<number>(n + 1).fill(0)
    for (const r of rows) {
      const d = dayOf(r.spent_on)
      if (d >= 1 && d <= n) per[d]! += r.amount
    }
    const out = [0]
    for (let d = 1; d <= n; d++) out.push(out[d - 1]! + per[d]!)
    return out
  }
  const a = cum(current, days)
  const b = cum(previous, prevDays)
  const total = a[upTo] ?? 0
  const rate = upTo >= PROJECT_FROM_DAY && total > 0 ? total / upTo : null
  const projected = isCurrent && rate !== null ? Math.round(rate * days) : null

  const points: CurvePoint[] = []
  for (let d = 1; d <= days; d++) {
    points.push({
      day: d,
      now: d <= upTo ? (a[d] ?? 0) : null,
      prev: b[Math.min(d, prevDays)] ?? 0,
      proj: projected !== null && rate !== null && d >= upTo ? (d === upTo ? total : Math.round(rate * d)) : null,
    })
  }
  return { points, days, upTo, total, prevTotal: b[prevDays] ?? 0, prevSame: b[Math.min(upTo, prevDays)] ?? 0, projected }
}

export interface WeekdayBar {
  /** 0 = lunes … 6 = domingo */
  idx: number
  label: string
  name: string
  amount: number
  count: number
}

const WD = [
  ['L', 'lunes'],
  ['M', 'martes'],
  ['M', 'miércoles'],
  ['J', 'jueves'],
  ['V', 'viernes'],
  ['S', 'sábado'],
  ['D', 'domingo'],
] as const

/** Cuánto se gasta cada día de la semana en el mes (lunes a domingo). */
export function weekdayBars(rows: Row[]): { bars: WeekdayBar[]; top: number | null } {
  const bars: WeekdayBar[] = WD.map(([label, name], idx) => ({ idx, label, name, amount: 0, count: 0 }))
  for (const r of rows) {
    const [y, m, d] = r.spent_on.split('-').map(Number)
    const js = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getDay()
    const bar = bars[(js + 6) % 7]!
    bar.amount += r.amount
    bar.count += 1
  }
  const max = Math.max(...bars.map((b) => b.amount))
  return { bars, top: max > 0 ? bars.findIndex((b) => b.amount === max) : null }
}

/** Gasto de cada uno de los últimos meses: del hogar, o lo que le corresponde a una persona. */
export function monthlyTotals(history: Pick<HistExpense, 'amount' | 'paid_by' | 'spent_on' | 'shared'>[], who: string, month: Date, months = 6, split: Split = 2): { bars: MonthBar[]; avg: number | null } {
  const keys: { key: string; label: string }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(month.getFullYear(), month.getMonth() - i, 1)
    keys.push({ key: monthKey(d), label: monthShort(d) })
  }
  const sums = new Map<string, number>(keys.map((k) => [k.key, 0]))
  for (const e of history) {
    // De una persona: lo suyo y su parte de lo compartido, no lo que pagó
    const mine = who === 'all' ? e.amount : e.shared ? portion(e.amount, split, who) : e.paid_by === who ? e.amount : 0
    if (mine <= 0) continue
    const k = e.spent_on.slice(0, 7)
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + mine)
  }
  const cur = monthKey(month)
  const bars = keys.map((k) => ({ key: k.key, label: k.label, amount: Math.round(sums.get(k.key) ?? 0), current: k.key === cur }))
  const prior = bars.filter((b) => !b.current && b.amount > 0)
  return { bars, avg: prior.length > 0 ? Math.round(prior.reduce((s, b) => s + b.amount, 0) / prior.length) : null }
}
