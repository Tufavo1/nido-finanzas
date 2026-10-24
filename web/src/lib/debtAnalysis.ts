import type { Debt, DebtPayment } from './data'
import { debtView, payoffPlan } from './finance'
import type { Finding } from './finance'
import { money } from './format'
import { monthName, monthShort } from './ui'

/** Análisis inteligente de deudas: qué estrategia ahorra más interés, qué tan al día van los pagos y qué deuda pesa más. */

export interface Strategy {
  months: number
  interest: number
}

export interface StrategyPlan {
  /** Plata total que hoy se destina cada mes a las cuotas */
  budget: number
  /** Cada deuda con su cuota, sin reasignar lo que se libera */
  current: Strategy | null
  /** Al terminar una deuda, su cuota pasa a la de mayor interés */
  avalanche: Strategy | null
  /** Al terminar una deuda, su cuota pasa a la de menor saldo */
  snowball: Strategy | null
  /** Orden en que conviene atacarlas (mayor interés primero) */
  order: string[]
  /** Lo que ahorra la avalancha frente a seguir como hoy */
  interestSaved: number
  monthsSaved: number
  /** Qué estrategia recomienda: la que paga menos interés (si empatan, la bola de nieve, que motiva más) */
  best: 'avalanche' | 'snowball' | 'same'
}

export interface ExtraScenario {
  extra: number
  months: number
  interest: number
  monthsSaved: number
  interestSaved: number
}

export interface MonthPayments {
  key: string
  label: string
  amount: number
  count: number
}

export interface DueItem {
  id: string
  name: string
  daysToDue: number
  /** Lo que falta pagar de la cuota de este mes */
  pending: number
  paid: boolean
  /** Pasó el día de vencimiento y la cuota del mes no está completa */
  late: boolean
}

export interface DebtCost {
  id: string
  name: string
  remaining: number
  rate: number
  /** Interés que se paga en total hasta terminarla; null si la cuota no la baja */
  totalInterest: number | null
  monthlyInterest: number
}

export interface PaymentsReport {
  total: number
  count: number
  byMonth: MonthPayments[]
  /** Meses seguidos (hasta el actual) con al menos un pago */
  streak: number
  lastPaidDays: number | null
  /** Cuota total esperada este mes frente a lo pagado */
  expected: number
  paidThisMonth: number
  compliancePct: number | null
  due: DueItem[]
}

export interface DebtInsights {
  plan: StrategyPlan | null
  extras: ExtraScenario[]
  payments: PaymentsReport
  costs: DebtCost[]
  findings: Finding[]
}

const MAX_MONTHS = 600
const EXTRAS = [20_000, 50_000, 100_000]
const DAY = 86_400_000
const meses = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`

interface Sim {
  name: string
  balance: number
  rate: number
  payment: number
}

/** Mes a mes: cada deuda cobra su interés y recibe su cuota; lo que sobra del presupuesto va a la primera de la lista. */
function simulate(debts: Sim[], budget: number, order: string[], rollover: boolean): Strategy | null {
  const live = debts.map((d) => ({ ...d }))
  let months = 0
  let interest = 0
  while (live.some((d) => d.balance > 0.5)) {
    if (++months > MAX_MONTHS) return null
    const before = live.reduce((t, d) => t + Math.max(d.balance, 0), 0)
    for (const d of live) {
      if (d.balance <= 0.5) continue
      const i = (d.balance * d.rate) / 100
      d.balance += i
      interest += i
    }
    let spare = budget
    for (const d of live) {
      if (d.balance <= 0.5) continue
      const pay = Math.min(d.payment, d.balance)
      d.balance -= pay
      spare -= pay
    }
    if (rollover) {
      for (const name of order) {
        const d = live.find((x) => x.name === name)
        if (!d || d.balance <= 0.5 || spare <= 0) continue
        const pay = Math.min(spare, d.balance)
        d.balance -= pay
        spare -= pay
      }
    }
    // Sin avance posible (cuotas que no cubren el interés y sin sobrante): no termina nunca
    const after = live.reduce((t, d) => t + Math.max(d.balance, 0), 0)
    if (after >= before - 0.5) return null
  }
  return { months, interest: Math.round(interest) }
}

const byMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function analyzeDebts(debts: Debt[], payments: DebtPayment[], now: Date = new Date()): DebtInsights {
  const views = debts.map((d) => debtView(d, payments, now))
  const active = views.filter((v) => v.remaining > 0)

  // ---------- Costo de cada deuda ----------
  const costs: DebtCost[] = active
    .map((v) => {
      const plan = payoffPlan(v.remaining, v.debt.monthly_payment, v.debt.monthly_rate)
      return {
        id: v.debt.id,
        name: v.debt.name,
        remaining: v.remaining,
        rate: v.debt.monthly_rate,
        totalInterest: plan ? plan.interest : null,
        monthlyInterest: v.monthlyInterest,
      }
    })
    .sort((a, b) => b.monthlyInterest - a.monthlyInterest)

  // ---------- Estrategia: avalancha o bola de nieve ----------
  let plan: StrategyPlan | null = null
  const sims: Sim[] = active.map((v) => ({ name: v.debt.name, balance: v.remaining, rate: v.debt.monthly_rate, payment: v.debt.monthly_payment }))
  const budget = sims.reduce((s, d) => s + d.payment, 0)
  if (active.length > 0 && budget > 0) {
    const avalancheOrder = [...sims].sort((a, b) => b.rate - a.rate || a.balance - b.balance).map((d) => d.name)
    const snowballOrder = [...sims].sort((a, b) => a.balance - b.balance).map((d) => d.name)
    const current = simulate(sims, budget, avalancheOrder, false)
    const avalanche = simulate(sims, budget, avalancheOrder, true)
    const snowball = simulate(sims, budget, snowballOrder, true)
    const interestSaved = current && avalanche ? Math.max(0, current.interest - avalanche.interest) : 0
    const monthsSaved = current && avalanche ? Math.max(0, current.months - avalanche.months) : 0
    let best: StrategyPlan['best'] = 'same'
    if (avalanche && snowball) {
      if (avalanche.interest < snowball.interest - 1000) best = 'avalanche'
      else if (snowball.interest < avalanche.interest - 1000) best = 'snowball'
    }
    plan = { budget, current, avalanche, snowball, order: avalancheOrder, interestSaved, monthsSaved, best }
  }

  // ---------- Qué pasa si se paga algo más ----------
  const extras: ExtraScenario[] = []
  if (plan?.avalanche) {
    const base = plan.avalanche
    for (const extra of EXTRAS) {
      const r = simulate(sims, budget + extra, plan.order, true)
      if (r) extras.push({ extra, months: r.months, interest: r.interest, monthsSaved: Math.max(0, base.months - r.months), interestSaved: Math.max(0, base.interest - r.interest) })
    }
  }

  // ---------- Pagos: historial y cumplimiento ----------
  const monthKeyNow = byMonthKey(now)
  const keys: { key: string; label: string }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push({ key: byMonthKey(d), label: monthShort(d) })
  }
  const byMonth: MonthPayments[] = keys.map((k) => {
    const list = payments.filter((p) => p.paid_on.startsWith(k.key))
    return { key: k.key, label: k.label, amount: list.reduce((s, p) => s + p.amount, 0), count: list.length }
  })
  let streak = 0
  for (let i = byMonth.length - 1; i >= 0; i--) {
    if ((byMonth[i]?.count ?? 0) > 0) streak++
    else if (byMonth[i]?.key === monthKeyNow) continue // el mes en curso aún puede llegar
    else break
  }
  const lastPaid = payments.map((p) => p.paid_on).sort().at(-1)
  const lastPaidDays = lastPaid ? Math.max(0, Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - Date.parse(`${lastPaid}T00:00:00`)) / DAY)) : null

  const withPayment = active.filter((v) => v.debt.monthly_payment > 0)
  const expected = withPayment.reduce((s, v) => s + v.debt.monthly_payment, 0)
  const paidThisMonth = withPayment.reduce((s, v) => s + Math.min(v.paidThisMonth, v.debt.monthly_payment), 0)
  const today = now.getDate()
  const due: DueItem[] = withPayment
    .filter((v) => v.daysToDue !== null)
    .map((v) => {
      const pending = Math.max(0, v.debt.monthly_payment - v.paidThisMonth)
      const late = !!v.debt.due_day && v.debt.due_day < today && pending > 0
      return { id: v.debt.id, name: v.debt.name, daysToDue: v.daysToDue ?? 0, pending, paid: pending === 0, late }
    })
    .sort((a, b) => Number(b.late) - Number(a.late) || a.daysToDue - b.daysToDue)

  const report: PaymentsReport = {
    total: payments.reduce((s, p) => s + p.amount, 0),
    count: payments.length,
    byMonth,
    streak,
    lastPaidDays,
    expected,
    paidThisMonth,
    compliancePct: expected > 0 ? Math.round((paidThisMonth * 100) / expected) : null,
    due,
  }

  // ---------- Conclusiones, de lo más urgente a lo más útil ----------
  const findings: Finding[] = []
  for (const d of due.filter((x) => x.late)) {
    findings.push({
      level: 'bad',
      title: `**${d.name}** tiene la cuota atrasada`,
      detail: `Faltan ${money(d.pending)} de la cuota de ${monthName(now)}. Pagar tarde suele cobrar multas e intereses penales.`,
    })
  }
  for (const c of costs.filter((x) => x.totalInterest === null)) {
    findings.push({ level: 'bad', title: `**${c.name}** no va a bajar con esa cuota`, detail: `Cada mes se le suman ~${money(c.monthlyInterest)} de interés y la cuota no lo cubre. Sube la cuota o negocia la tasa.` })
  }
  const soon = due.filter((x) => !x.late && !x.paid && x.daysToDue <= 5)
  for (const d of soon.slice(0, 2)) {
    findings.push({ level: 'warn', title: `**${d.name}** vence ${d.daysToDue === 0 ? 'hoy' : d.daysToDue === 1 ? 'mañana' : `en ${d.daysToDue} días`}`, detail: `Prepara ${money(d.pending)}.` })
  }
  if (plan && active.length > 1 && plan.interestSaved >= 10_000 && plan.avalanche) {
    const first = plan.order[0]
    findings.push({
      level: 'ok',
      title: `Pagando primero **${first}** ahorran ${money(plan.interestSaved)} de interés`,
      detail: `Cuando termine una deuda, pasen su cuota a la siguiente de mayor interés en vez de gastarla. Así terminan ${plan.monthsSaved > 0 ? `${meses(plan.monthsSaved)} antes` : 'igual de rápido'}, en ${meses(plan.avalanche.months)}.`,
    })
  }
  const costly = costs[0]
  if (costly && costly.rate >= 2 && costly.monthlyInterest > 0) {
    findings.push({
      level: 'warn',
      title: `**${costly.name}** es la más cara de mantener`,
      detail: `Cobra ${costly.rate.toString().replace('.', ',')} % al mes: ~${money(costly.monthlyInterest)} de interés mensual${costly.totalInterest !== null ? ` y ${money(costly.totalInterest)} en total hasta terminarla` : ''}. Conviene refinanciarla o abonar extra.`,
    })
  }
  const best = extras.find((e) => e.interestSaved > 0 && e.monthsSaved >= 2) ?? extras[0]
  if (best && best.interestSaved >= 5_000) {
    findings.push({ level: 'ok', title: `Con ${money(best.extra)} extra al mes terminan ${meses(best.monthsSaved)} antes`, detail: `Se ahorran ${money(best.interestSaved)} de interés. Apliquen el extra a **${plan?.order[0] ?? 'la deuda de mayor interés'}**.` })
  }
  if (report.compliancePct !== null && report.compliancePct >= 100 && expected > 0) {
    findings.push({ level: 'ok', title: 'Cuotas de este mes al día', detail: `Ya pagaron las ${money(expected)} que corresponden a ${monthName(now)}.` })
  }
  if (streak >= 3) findings.push({ level: 'ok', title: `${streak} meses seguidos pagando`, detail: 'La constancia es lo que más rápido saca de las deudas.' })
  if (report.lastPaidDays !== null && report.lastPaidDays > 45 && active.length > 0) {
    findings.push({ level: 'warn', title: `Hace ${report.lastPaidDays} días que no anotan un pago`, detail: 'Si ya pagaron, anótalo para que el saldo y los plazos sean reales.' })
  }
  const rank = { bad: 0, warn: 1, ok: 2 } as const
  findings.sort((a, b) => rank[a.level] - rank[b.level])

  return { plan, extras, payments: report, costs, findings }
}

export interface ExtraEffect {
  /** Meses y interés total pagando solo las cuotas de hoy */
  base: Strategy
  /** Meses y interés total sumando el extra mensual a la deuda de mayor interés */
  withExtra: Strategy
  monthsSaved: number
  interestSaved: number
  /** Deuda a la que conviene aplicar el extra */
  target: string
}

/** Qué pasa si cada mes se paga `extra` más, aplicado a la deuda que más interés cobra. null si no hay deudas o no terminan. */
export function extraEffect(debts: Debt[], payments: DebtPayment[], extra: number, now: Date = new Date()): ExtraEffect | null {
  if (extra <= 0) return null
  const sims: Sim[] = debts
    .map((d) => debtView(d, payments, now))
    .filter((v) => v.remaining > 0)
    .map((v) => ({ name: v.debt.name, balance: v.remaining, rate: v.debt.monthly_rate, payment: v.debt.monthly_payment }))
  const budget = sims.reduce((s, d) => s + d.payment, 0)
  if (sims.length === 0 || budget <= 0) return null
  const order = [...sims].sort((a, b) => b.rate - a.rate || a.balance - b.balance).map((d) => d.name)
  const base = simulate(sims, budget, order, true)
  const withExtra = simulate(sims, budget + extra, order, true)
  if (!base || !withExtra) return null
  return { base, withExtra, monthsSaved: Math.max(0, base.months - withExtra.months), interestSaved: Math.max(0, base.interest - withExtra.interest), target: order[0] ?? '' }
}
