import type { Debt, DebtPayment, Recurring } from './data'
import { debtView } from './finance'
import { toISO } from './format'
import { fraction, portion } from './split'
import type { Split } from './split'
import { nextOccurrence } from './ui'

/** Pagos que vienen: lo que vence en los próximos 30 días (gastos fijos, cuotas de deudas y el sueldo) y si el mes alcanza. */

export type EventKind = 'fijo' | 'deuda' | 'sueldo'

export interface UpcomingEvent {
  key: string
  kind: EventKind
  name: string
  /** Siempre positivo; el sueldo es una entrada */
  amount: number
  date: Date
  inDays: number
  /** La cuota ya venció este mes y sigue sin pagarse */
  late: boolean
}

export interface Upcoming {
  events: UpcomingEvent[]
  /** Lo que sale en los próximos 30 días */
  out30: number
  /** De eso, lo que cae en lo que queda del mes en curso */
  outThisMonth: number
  /** Día de los próximos 30 con más plata por pagar */
  heaviest: { date: Date; total: number; names: string[] } | null
  nextIncome: UpcomingEvent | null
  /** Lo que quedaría a fin de mes tras pagar lo que falta y seguir gastando como hasta ahora; null sin sueldo */
  endOfMonth: number | null
  /** Gasto variable diario con el que se calculó */
  variableDaily: number
}

export interface UpcomingInput {
  now?: Date
  meId: string
  split: Split
  recurring: Recurring[]
  debts: Debt[]
  debtPayments: DebtPayment[]
  salary: { amount: number; pay_day: number } | null
  /** Lo que te sobra hoy del mes (ingreso − gastos − cuotas); null sin sueldo */
  free: number | null
  /** Lo que gastas por día en cosas que no son fijas */
  variableDaily: number
}

const DAY = 86_400_000
const HORIZON_DAYS = 30
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
const monthPrefix = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Próxima fecha del día indicado; si `skipThisMonth`, salta al mes que viene aunque caiga este mes */
function occurrence(day: number, now: Date, skipThisMonth: boolean): Date {
  const next = nextOccurrence(day, now)
  if (!skipThisMonth || !sameMonth(next, now)) return next
  return nextOccurrence(day, new Date(now.getFullYear(), now.getMonth() + 1, 1))
}

/** Mi parte de los gastos fijos que todavía no se anotan este mes (vencen entre hoy y fin de mes): plata ya comprometida aunque aún no salga */
export function pendingFixedThisMonth(recurring: Recurring[], meId: string, split: Split, now: Date = new Date()): number {
  let total = 0
  for (const r of recurring) {
    if (!r.active) continue
    const mine = r.shared ? portion(r.amount, split, meId) : r.paid_by === meId ? r.amount : 0
    if (mine <= 0) continue
    if (r.last_applied && r.last_applied.startsWith(monthPrefix(now))) continue
    const date = nextOccurrence(r.day_of_month, now)
    if (!sameMonth(date, now) || r.starts_on > toISO(date)) continue
    total += mine
  }
  return Math.round(total)
}

/** Mi parte de todos los gastos fijos activos en un mes normal, se hayan anotado ya o no */
export function monthlyFixedTotal(recurring: Recurring[], meId: string, split: Split, now: Date = new Date()): number {
  const endOfMonth = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  let total = 0
  for (const r of recurring) {
    if (!r.active || r.starts_on > endOfMonth) continue
    total += r.shared ? portion(r.amount, split, meId) : r.paid_by === meId ? r.amount : 0
  }
  return Math.round(total)
}

export function buildUpcoming(input: UpcomingInput): Upcoming {
  const now = input.now ?? new Date()
  const today = startOfDay(now)
  const limit = new Date(today.getTime() + HORIZON_DAYS * DAY)
  const events: UpcomingEvent[] = []
  const inDays = (d: Date) => Math.round((startOfDay(d).getTime() - today.getTime()) / DAY)

  for (const r of input.recurring) {
    if (!r.active) continue
    const mine = r.shared ? portion(r.amount, input.split, input.meId) : r.paid_by === input.meId ? r.amount : 0
    if (mine <= 0) continue
    // Si ya se anotó este mes, el próximo es el del mes que viene
    const appliedThisMonth = !!r.last_applied && r.last_applied.startsWith(monthPrefix(now))
    const date = occurrence(r.day_of_month, now, appliedThisMonth)
    if (r.starts_on > toISO(date)) continue
    if (date <= limit) events.push({ key: `r${r.id}`, kind: 'fijo', name: r.note || 'Gasto fijo', amount: Math.round(mine), date, inDays: inDays(date), late: false })
  }

  for (const d of input.debts) {
    if (d.owner_id !== input.meId && d.owner_id !== null) continue
    const v = debtView(d, input.debtPayments, now)
    if (v.remaining <= 0 || d.monthly_payment <= 0 || !d.due_day) continue
    const share = d.owner_id === input.meId ? 1 : fraction(input.split, input.meId)
    const pending = Math.max(0, d.monthly_payment - v.paidThisMonth)
    const paidThisMonth = pending === 0
    const late = !paidThisMonth && d.due_day < today.getDate()
    const date = late ? today : occurrence(d.due_day, now, paidThisMonth)
    const amount = Math.round((paidThisMonth ? d.monthly_payment : pending) * share)
    if (date <= limit && amount > 0) events.push({ key: `d${d.id}`, kind: 'deuda', name: d.name, amount, date, inDays: inDays(date), late })
  }

  let nextIncome: UpcomingEvent | null = null
  if (input.salary && input.salary.amount > 0) {
    const date = nextOccurrence(input.salary.pay_day, now)
    nextIncome = { key: 'sueldo', kind: 'sueldo', name: 'Te depositan el sueldo', amount: input.salary.amount, date, inDays: inDays(date), late: false }
    if (date <= limit) events.push(nextIncome)
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind))
  const outs = events.filter((e) => e.kind !== 'sueldo')
  const out30 = outs.reduce((s, e) => s + e.amount, 0)
  const outThisMonth = outs.filter((e) => sameMonth(e.date, now)).reduce((s, e) => s + e.amount, 0)

  const byDay = new Map<number, UpcomingEvent[]>()
  for (const e of outs) byDay.set(startOfDay(e.date).getTime(), [...(byDay.get(startOfDay(e.date).getTime()) ?? []), e])
  let heaviest: Upcoming['heaviest'] = null
  for (const [t, list] of byDay) {
    const total = list.reduce((s, e) => s + e.amount, 0)
    if (!heaviest || total > heaviest.total) heaviest = { date: new Date(t), total, names: list.map((e) => e.name) }
  }

  // Las cuotas de deuda ya están descontadas en lo que te sobra (se cuentan completas todo el mes): solo falta restar los fijos que aún no se anotan
  const pendingFixed = outs.filter((e) => e.kind === 'fijo' && sameMonth(e.date, now)).reduce((s, e) => s + e.amount, 0)
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
  const endOfMonth = input.free === null ? null : Math.round(input.free - pendingFixed - input.variableDaily * daysLeft)

  return { events, out30, outThisMonth, heaviest, nextIncome, endOfMonth, variableDaily: Math.round(input.variableDaily) }
}
