import type { Debt, DebtPayment } from './data'

export type Level = 'ok' | 'warn' | 'bad'
export interface Finding {
  level: Level
  title: string
  detail: string
}

const sumBy = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0)

/** Meses para saldar con una cuota fija e interés mensual en %. null = nunca (la cuota no cubre el interés) */
export function monthsToPayoff(balance: number, payment: number, monthlyRatePct: number): number | null {
  if (balance <= 0) return 0
  if (payment <= 0) return null
  const r = monthlyRatePct / 100
  if (r === 0) return Math.ceil(balance / payment)
  if (payment <= balance * r) return null
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r))
}

export interface DebtView {
  debt: Debt
  paid: number
  /** Saldo pendiente (el capital original menos lo abonado) */
  remaining: number
  progressPct: number
  /** Interés aproximado que genera cada mes el saldo actual */
  monthlyInterest: number
  months: number | null
  /** La cuota no alcanza ni para cubrir el interés */
  stuck: boolean
  paidThisMonth: number
  /** Días hasta el próximo vencimiento, si hay día de pago */
  daysToDue: number | null
}

export function debtView(debt: Debt, payments: DebtPayment[], now: Date = new Date()): DebtView {
  const mine = payments.filter((p) => p.debt_id === debt.id)
  const paid = sumBy(mine, (p) => p.amount)
  const remaining = Math.max(0, debt.original_amount - paid)
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const paidThisMonth = sumBy(
    mine.filter((p) => p.paid_on.startsWith(monthPrefix)),
    (p) => p.amount,
  )
  const months = monthsToPayoff(remaining, debt.monthly_payment, debt.monthly_rate)
  const monthlyInterest = Math.round((remaining * debt.monthly_rate) / 100)

  let daysToDue: number | null = null
  if (debt.due_day) {
    const last = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
    const y = now.getFullYear()
    const m = now.getMonth()
    let due = new Date(y, m, Math.min(debt.due_day, last(y, m)))
    const today = new Date(y, m, now.getDate())
    if (due < today) due = new Date(y, m + 1, Math.min(debt.due_day, last(y, m + 1)))
    daysToDue = Math.round((due.getTime() - today.getTime()) / 86400000)
  }

  return {
    debt,
    paid,
    remaining,
    progressPct: Math.min(100, Math.round((paid * 100) / debt.original_amount)),
    monthlyInterest,
    months,
    stuck: remaining > 0 && months === null,
    paidThisMonth,
    daysToDue,
  }
}

export interface DebtSummary {
  views: DebtView[]
  remaining: number
  monthly: number
  interest: number
  /** La deuda con la tasa más alta: conviene atacarla primero (método avalancha) */
  focus: DebtView | null
  /** Meses hasta quedar libres de deuda siguiendo las cuotas actuales; null si alguna no avanza */
  freeInMonths: number | null
  findings: Finding[]
}

export function summarizeDebts(debts: Debt[], payments: DebtPayment[], now: Date = new Date()): DebtSummary {
  const views = debts.map((d) => debtView(d, payments, now)).sort((a, b) => b.debt.monthly_rate - a.debt.monthly_rate)
  const active = views.filter((v) => v.remaining > 0)
  const remaining = sumBy(active, (v) => v.remaining)
  const monthly = sumBy(active, (v) => v.debt.monthly_payment)
  const interest = sumBy(active, (v) => v.monthlyInterest)
  const focus = active.find((v) => v.debt.monthly_rate > 0) ?? null
  const freeInMonths = active.some((v) => v.stuck)
    ? null
    : active.reduce((mx, v) => Math.max(mx, v.months ?? 0), 0)

  const findings: Finding[] = []
  if (active.length === 0) {
    findings.push({
      level: 'ok',
      title: debts.length > 0 ? 'Sin deudas pendientes' : 'Sin deudas registradas',
      detail: debts.length > 0 ? 'Todas están saldadas. Buen trabajo.' : 'Si tienen alguna, agrégala para llevar el control.',
    })
    return { views, remaining, monthly, interest, focus, freeInMonths, findings }
  }

  for (const v of active.filter((x) => x.stuck)) {
    findings.push({
      level: 'bad',
      title: `${v.debt.name}: la cuota no la va a bajar`,
      detail:
        v.debt.monthly_payment === 0
          ? 'No tiene cuota definida. Fija un monto mensual para que avance.'
          : `La cuota no cubre ni los intereses (~${Math.round(v.monthlyInterest).toLocaleString('es-CL')} al mes). Súbela o abona de más.`,
    })
  }
  for (const v of active) {
    if (v.daysToDue !== null && v.daysToDue <= 5 && v.debt.monthly_payment > 0 && v.paidThisMonth < v.debt.monthly_payment) {
      findings.push({
        level: 'warn',
        title: `${v.debt.name} vence ${v.daysToDue === 0 ? 'hoy' : v.daysToDue === 1 ? 'mañana' : `en ${v.daysToDue} días`}`,
        detail: 'Aún no está registrada la cuota de este mes.',
      })
    }
  }
  if (focus && active.length > 1) {
    findings.push({
      level: 'warn',
      title: `Ataquen primero «${focus.debt.name}»`,
      detail: `Es la que más interés cobra (${focus.debt.monthly_rate} % mensual). Cualquier extra que tengan rinde más ahí.`,
    })
  }
  if (interest > 0) {
    findings.push({
      level: interest > monthly * 0.4 ? 'bad' : 'warn',
      title: 'Parte de lo que pagan se va en intereses',
      detail: `Unos ${Math.round(interest).toLocaleString('es-CL')} al mes, el ${monthly > 0 ? Math.round((interest * 100) / monthly) : 0} % de sus cuotas.`,
    })
  }
  const best = [...active].sort((a, b) => b.progressPct - a.progressPct)[0]
  if (best && best.progressPct >= 50) {
    findings.push({
      level: 'ok',
      title: `${best.debt.name} va ${best.progressPct} % pagada`,
      detail: 'Van muy bien con esta. Sigan igual.',
    })
  }
  if (freeInMonths !== null && freeInMonths > 0 && !findings.some((f) => f.level === 'bad')) {
    findings.push({
      level: 'ok',
      title: `Libres de deudas en ~${freeInMonths} ${freeInMonths === 1 ? 'mes' : 'meses'}`,
      detail: 'Si mantienen las cuotas actuales.',
    })
  }
  return { views, remaining, monthly, interest, focus, freeInMonths, findings }
}

/** Cuánto de las cuotas me toca: lo mío completo y la mitad de lo compartido */
export function myDebtShare(debts: Debt[], payments: DebtPayment[], meId: string, memberCount: number): number {
  return Math.round(
    sumBy(
      debts.filter((d) => debtView(d, payments).remaining > 0),
      (d) => (d.owner_id === meId ? d.monthly_payment : d.owner_id === null ? d.monthly_payment / Math.max(memberCount, 1) : 0),
    ),
  )
}

export interface SalaryAnalysis {
  income: number
  spent: number
  commitments: number
  /** Lo que queda hoy después de gastos y cuotas */
  free: number
  /** Cierre estimado del mes (solo mes en curso con datos suficientes) */
  projectedFree: number | null
  spentPct: number
  debtPct: number
  /** Cuánto puedes gastar por día lo que resta del mes sin pasarte */
  safeDaily: number | null
  level: Level
  headline: string
  findings: Finding[]
}

export function analyzeSalary(opts: {
  income: number
  /** Gastos personales + su mitad de lo compartido */
  spent: number
  /** Cuotas de deuda que le corresponden */
  commitments: number
  month: Date
  now?: Date
}): SalaryAnalysis {
  const { income, spent, commitments, month } = opts
  const now = opts.now ?? new Date()
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const isCurrent = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()
  const elapsed = isCurrent ? now.getDate() : days
  const daysLeft = isCurrent ? days - now.getDate() : 0

  const free = income - spent - commitments
  const projectedSpent = isCurrent && elapsed >= 5 ? Math.round((spent / elapsed) * days) : null
  const projectedFree = projectedSpent === null ? null : income - projectedSpent - commitments
  const spentPct = income > 0 ? Math.round((spent * 100) / income) : 0
  const debtPct = income > 0 ? Math.round((commitments * 100) / income) : 0
  const safeDaily = isCurrent && daysLeft > 0 ? Math.max(0, Math.floor(free / daysLeft)) : null

  const findings: Finding[] = []
  const outlook = projectedFree ?? free
  const outlookPct = income > 0 ? Math.round((outlook * 100) / income) : 0
  let level: Level = 'ok'
  let headline = 'Tu sueldo te alcanza con holgura'

  if (income <= 0) {
    return { income, spent, commitments, free, projectedFree, spentPct, debtPct, safeDaily, level: 'warn', headline: 'Pon tu sueldo para ver cómo vas', findings }
  }

  if (free < 0) {
    level = 'bad'
    headline = 'Ya gastaste más de lo que ganas este mes'
    findings.push({
      level: 'bad',
      title: 'Estás sobre tu sueldo',
      detail: `Gastos y cuotas superan tu sueldo en ${Math.round(-free).toLocaleString('es-CL')}.`,
    })
  } else if (projectedFree !== null && projectedFree < 0) {
    level = 'bad'
    headline = 'A este ritmo no te alcanza'
    findings.push({
      level: 'bad',
      title: 'Vas a pasarte de tu sueldo',
      detail: `Al cierre te faltarían ~${Math.round(-projectedFree).toLocaleString('es-CL')}. Baja el ritmo${safeDaily !== null ? ` a ${safeDaily.toLocaleString('es-CL')} al día` : ''}.`,
    })
  } else if (outlookPct < 10) {
    level = 'warn'
    headline = 'Te alcanza, pero casi sin ahorro'
    findings.push({
      level: 'warn',
      title: 'Ahorro bajo',
      detail: `Te quedaría ${Math.max(outlookPct, 0)} % del sueldo. Una meta sana es 10–20 %.`,
    })
  } else {
    findings.push({
      level: 'ok',
      title: `Puedes ahorrar ~${outlookPct} % del sueldo`,
      detail: `Te quedarían ~${Math.round(outlook).toLocaleString('es-CL')} a fin de mes.`,
    })
  }

  if (commitments > 0) {
    if (debtPct > 40) {
      if (level !== 'bad') level = 'bad'
      findings.push({
        level: 'bad',
        title: `Tus deudas se llevan el ${debtPct} % del sueldo`,
        detail: 'Sobre 40 % se vuelve difícil de sostener. Prioricen bajar las cuotas o el interés.',
      })
    } else if (debtPct > 30) {
      if (level === 'ok') level = 'warn'
      findings.push({
        level: 'warn',
        title: `Tus deudas son el ${debtPct} % del sueldo`,
        detail: 'Lo recomendable es no pasar de 30 %.',
      })
    } else {
      findings.push({ level: 'ok', title: `Deudas controladas (${debtPct} % del sueldo)`, detail: 'Dentro de lo recomendable.' })
    }
  }

  if (spentPct > 70 && free >= 0 && level === 'ok') level = 'warn'
  return { income, spent, commitments, free, projectedFree, spentPct, debtPct, safeDaily, level, headline, findings }
}
