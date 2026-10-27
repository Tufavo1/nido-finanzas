import type { Debt, DebtPayment } from './data'
import { portion } from './split'
import type { Split } from './split'

export type Level = 'ok' | 'warn' | 'bad'
export interface Finding {
  level: Level
  title: string
  detail: string
}

const isCurrentMonth = (month: Date, now: Date) => month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()
const sumBy = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0)

/** Cuota fija mensual para pagar `balance` en `months` cuotas, con interés mensual en % (sistema francés) */
export function installment(balance: number, months: number, monthlyRatePct: number): number {
  if (balance <= 0 || months <= 0) return 0
  const r = monthlyRatePct / 100
  if (r === 0) return Math.ceil(balance / months)
  return Math.ceil((balance * r) / (1 - (1 + r) ** -months))
}

/** Meses para saldar con una cuota fija e interés mensual en %. null = nunca (la cuota no cubre el interés) */
export function monthsToPayoff(balance: number, payment: number, monthlyRatePct: number): number | null {
  if (balance <= 0) return 0
  if (payment <= 0) return null
  const r = monthlyRatePct / 100
  if (r === 0) return Math.ceil(balance / payment)
  if (payment <= balance * r) return null
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r))
}

/** Mes a mes: en cuántos meses se termina y cuánto se paga de interés en total. null = la cuota no alcanza ni para el interés */
export function payoffPlan(balance: number, payment: number, monthlyRatePct: number): { months: number; interest: number } | null {
  if (balance <= 0) return { months: 0, interest: 0 }
  const r = monthlyRatePct / 100
  if (payment <= 0 || payment <= balance * r) return null
  let left = balance
  let interest = 0
  let months = 0
  while (left > 0 && months < 1200) {
    const i = left * r
    interest += i
    left = left + i - payment
    months += 1
  }
  return { months, interest: Math.round(interest) }
}

export interface ExtraPaymentEffect {
  /** Con la cuota de hoy */
  base: { months: number; interest: number }
  /** Con la cuota de hoy más lo extra */
  withExtra: { months: number; interest: number }
  monthsSaved: number
  interestSaved: number
}

/** Qué pasa si cada mes se paga algo más que la cuota */
export function extraPaymentEffect(balance: number, payment: number, monthlyRatePct: number, extra: number): ExtraPaymentEffect | null {
  if (extra <= 0) return null
  const base = payoffPlan(balance, payment, monthlyRatePct)
  const withExtra = payoffPlan(balance, payment + extra, monthlyRatePct)
  if (!withExtra) return null
  // Si hoy la cuota no avanza, lo extra lo "arregla": no hay base con la que comparar
  if (!base) return { base: { months: 0, interest: 0 }, withExtra, monthsSaved: 0, interestSaved: 0 }
  return { base, withExtra, monthsSaved: base.months - withExtra.months, interestSaved: base.interest - withExtra.interest }
}

export interface DebtView {
  debt: Debt
  paid: number
  /** Saldo pendiente: lo anotado menos lo abonado, más el interés que se fue sumando cada mes */
  remaining: number
  /** Interés que se sumó al saldo desde que se anotó la deuda */
  accrued: number
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

const monthIndex = (y: number, m: number) => y * 12 + m

/**
 * Saldo real de una deuda: parte de lo anotado y, cada mes que pasa, le suma el interés del saldo
 * que quedaba; los pagos de cada mes lo bajan. Sin tasa, o sin fecha de alta, es solo lo anotado menos lo pagado.
 */
export function accruedBalance(debt: Debt, mine: DebtPayment[], now: Date): { remaining: number; accrued: number } {
  const paid = sumBy(mine, (p) => p.amount)
  const flat = { remaining: Math.max(0, debt.original_amount - paid), accrued: 0 }
  const created = Date.parse(debt.created_at)
  if (!Number.isFinite(created) || debt.monthly_rate <= 0) return flat

  const start = new Date(created)
  const first = monthIndex(start.getFullYear(), start.getMonth())
  const last = Math.max(first, monthIndex(now.getFullYear(), now.getMonth()))
  const rate = debt.monthly_rate / 100
  // Un pago anterior al alta cuenta en el primer mes, y uno futuro en el mes actual
  const paidIn = new Map<number, number>()
  for (const p of mine) {
    const y = Number(p.paid_on.slice(0, 4))
    const m = Number(p.paid_on.slice(5, 7)) - 1
    const idx = Math.min(last, Math.max(first, monthIndex(y, m)))
    paidIn.set(idx, (paidIn.get(idx) ?? 0) + p.amount)
  }

  let balance = debt.original_amount
  let accrued = 0
  for (let idx = first; idx <= last; idx++) {
    if (idx > first) {
      const interest = balance * rate
      balance += interest
      accrued += interest
    }
    balance = Math.max(0, balance - (paidIn.get(idx) ?? 0))
  }
  return { remaining: Math.round(balance), accrued: Math.round(accrued) }
}

export function debtView(debt: Debt, payments: DebtPayment[], now: Date = new Date()): DebtView {
  const mine = payments.filter((p) => p.debt_id === debt.id)
  const paid = sumBy(mine, (p) => p.amount)
  const { remaining, accrued } = accruedBalance(debt, mine, now)
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
    accrued,
    progressPct: Math.min(100, Math.round((paid * 100) / (debt.original_amount + accrued))),
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
      title: `Ataquen primero **${focus.debt.name}**`,
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

/** Cuánto de las cuotas me toca: lo mío completo y mi parte de lo compartido */
export function myDebtShare(debts: Debt[], payments: DebtPayment[], meId: string, split: Split): number {
  return Math.round(
    sumBy(
      debts.filter((d) => debtView(d, payments).remaining > 0),
      (d) => (d.owner_id === meId ? d.monthly_payment : d.owner_id === null ? portion(d.monthly_payment, split, meId) : 0),
    ),
  )
}

/** Ingreso del mes: sueldo más ingresos extra (bonos, ventas…) */
export function monthIncome(salary: { amount: number } | null, extras: { amount: number }[] = []): number {
  return (salary?.amount ?? 0) + sumBy(extras, (x) => x.amount)
}

export interface TypicalMonth {
  income: number
  /** Gastos fijos que se repiten todos los meses (tu parte) */
  fixed: number
  commitments: number
  /** Gastos del día a día: lo que no es fijo, llevado a un mes completo */
  variable: number
  /** Lo que te queda en un mes normal */
  left: number
  /** Fijos de este mes que no se han anotado ni están por venir: se crearon después de su día */
  unbookedFixed: number
}

/** Cómo es un mes completo: lo que entra menos los fijos, las cuotas y lo que gastas día a día. */
export function typicalMonth(opts: {
  income: number
  /** Todos los fijos activos de un mes normal */
  monthlyFixed: number
  commitments: number
  /** Todo lo gastado en el mes (incluye los fijos ya anotados) */
  spent: number
  fixedBooked: number
  pendingFixed: number
  month: Date
  now?: Date
}): TypicalMonth {
  const now = opts.now ?? new Date()
  const days = new Date(opts.month.getFullYear(), opts.month.getMonth() + 1, 0).getDate()
  const elapsed = isCurrentMonth(opts.month, now) ? now.getDate() : days
  const booked = Math.min(Math.max(0, opts.fixedBooked), opts.spent)
  const dayToDay = Math.max(0, opts.spent - booked)
  const variable = Math.round(elapsed >= 5 && elapsed < days ? (dayToDay / elapsed) * days : dayToDay)
  const unbookedFixed = Math.max(0, Math.round(opts.monthlyFixed - booked - Math.max(0, opts.pendingFixed)))
  return {
    income: opts.income,
    fixed: opts.monthlyFixed,
    commitments: opts.commitments,
    variable,
    left: Math.round(opts.income - opts.monthlyFixed - opts.commitments - variable),
    unbookedFixed,
  }
}

export interface SalaryAnalysis {
  income: number
  spent: number
  commitments: number
  /** Lo que ya apartaste este mes para ahorrar: sale de tu sueldo igual que un gasto */
  saved: number
  /** Lo que queda hoy después de gastos, cuotas y ahorro */
  free: number
  /** Gastos fijos que vencen lo que resta del mes y aún no se descuentan */
  pendingFixed: number
  /** Lo que de verdad es tuyo: lo que queda hoy menos los fijos que todavía vienen */
  realFree: number
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
  /** Gastos personales + su parte de lo compartido */
  spent: number
  /** Cuotas de deuda que le corresponden */
  commitments: number
  month: Date
  now?: Date
  /** Fijos que vencen antes de fin de mes y todavía no se anotan */
  pendingFixed?: number
  /** Ahorro que ya apartaste este mes (aportes a metas): se descuenta del sueldo */
  saved?: number
  /** Parte de `spent` que ya viene de gastos fijos (no se repite a diario, así que no se proyecta) */
  fixedBooked?: number
}): SalaryAnalysis {
  const { income, spent, commitments, month } = opts
  const saved = Math.max(0, opts.saved ?? 0)
  const pendingFixed = isCurrentMonth(month, opts.now ?? new Date()) ? Math.max(0, opts.pendingFixed ?? 0) : 0
  const fixedBooked = Math.min(Math.max(0, opts.fixedBooked ?? 0), spent)
  const now = opts.now ?? new Date()
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const isCurrent = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()
  const elapsed = isCurrent ? now.getDate() : days
  const daysLeft = isCurrent ? days - now.getDate() : 0

  const free = income - spent - commitments - saved
  const realFree = free - pendingFixed
  // Lo variable se proyecta al ritmo de hoy; los fijos ya anotados no se repiten y los que faltan se suman enteros
  const projectedSpent = isCurrent && elapsed >= 5 ? Math.round(fixedBooked + ((spent - fixedBooked) / elapsed) * days + pendingFixed) : null
  const projectedFree = projectedSpent === null ? null : income - projectedSpent - commitments - saved
  const spentPct = income > 0 ? Math.round((spent * 100) / income) : 0
  const debtPct = income > 0 ? Math.round((commitments * 100) / income) : 0
  const safeDaily = isCurrent && daysLeft > 0 ? Math.max(0, Math.floor(realFree / daysLeft)) : null

  const findings: Finding[] = []
  const outlook = projectedFree ?? realFree
  // Lo ahorrado cuenta como ahorro: lo apartado más lo que sobraría
  const outlookPct = income > 0 ? Math.round(((outlook + saved) * 100) / income) : 0
  let level: Level = 'ok'
  let headline = 'Tu sueldo te alcanza con holgura'

  if (income <= 0) {
    return { income, spent, commitments, saved, free, pendingFixed, realFree, projectedFree, spentPct, debtPct, safeDaily, level: 'warn', headline: 'Pon tu sueldo para ver cómo vas', findings }
  }

  if (free < 0 && income - spent - commitments >= 0) {
    // Los gastos caben en el sueldo; lo que se pasó es lo apartado para ahorrar
    level = 'warn'
    headline = 'Apartaste más de lo que te sobraba'
    findings.push({
      level: 'warn',
      title: 'Tu ahorro supera lo que te sobraba',
      detail: `Entre gastos, cuotas y los ${Math.round(saved).toLocaleString('es-CL')} que apartaste ya pasaste tu sueldo en ${Math.round(-free).toLocaleString('es-CL')}. Esa diferencia salió de ahorros anteriores o hay que ajustar el mes.`,
    })
  } else if (free < 0) {
    level = 'bad'
    headline = 'Ya gastaste más de lo que ganas este mes'
    findings.push({
      level: 'bad',
      title: 'Estás sobre tu sueldo',
      detail: `Gastos${saved > 0 ? ', ahorro' : ''} y cuotas superan tu sueldo en ${Math.round(-free).toLocaleString('es-CL')}.`,
    })
  } else if (realFree < 0) {
    level = 'bad'
    headline = 'Lo que te queda no alcanza para tus gastos fijos'
    findings.push({
      level: 'bad',
      title: 'Te faltará para tus fijos',
      detail: `Te quedan ${Math.round(free).toLocaleString('es-CL')} pero aún vencen ${Math.round(pendingFixed).toLocaleString('es-CL')} en gastos fijos: faltarían ${Math.round(-realFree).toLocaleString('es-CL')}. No gastes en otra cosa.`,
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
      detail:
        saved > 0
          ? `Ya apartaste ${Math.round(saved).toLocaleString('es-CL')} y te quedarían ~${Math.round(outlook).toLocaleString('es-CL')} más a fin de mes.`
          : `Te quedarían ~${Math.round(outlook).toLocaleString('es-CL')} a fin de mes.`,
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
  return { income, spent, commitments, saved, free, pendingFixed, realFree, projectedFree, spentPct, debtPct, safeDaily, level, headline, findings }
}
