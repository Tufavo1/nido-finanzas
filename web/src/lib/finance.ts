import type { Debt, DebtPayment, Expense } from './data'
import { money, pctText, toISO } from './format'
import { portion } from './split'
import { digitsOnly } from './ui'
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
const monthPrefixOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const isCard = (d: Pick<Debt, 'kind'>) => d.kind === 'tarjeta'
/** Mi parte de un monto según quién es dueño: mía 100 %, sin dueño según el reparto, de la otra persona 0 */
const ownerShare = (amount: number, ownerId: string | null, meId: string, split: Split) =>
  ownerId === meId ? amount : ownerId === null ? portion(amount, split, meId) : 0

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

/**
 * Vista de una deuda. Una tarjeta (kind 'tarjeta') no acumula interés compuesto: su saldo es el de cardBalance
 * (con los gastos con tarjeta y las deudas del hogar si se pasan). Las demás usan accruedBalance.
 */
export function debtView(debt: Debt, payments: DebtPayment[], now: Date = new Date(), expenses: PaidExpense[] = [], allDebts: Debt[] = [debt]): DebtView {
  const mine = payments.filter((p) => p.debt_id === debt.id)
  const paid = sumBy(mine, (p) => p.amount)
  const { remaining, accrued } = isCard(debt)
    ? { remaining: cardBalance(debt, payments, expenses, allDebts).used, accrued: 0 }
    : accruedBalance(debt, mine, now)
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
    progressPct: debt.original_amount + accrued > 0 ? Math.min(100, Math.round((paid * 100) / (debt.original_amount + accrued))) : 0,
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

/** [expenses] y [allDebts] hacen que una tarjeta cuente sus compras; sin ellos se comporta como siempre. */
export function summarizeDebts(debts: Debt[], payments: DebtPayment[], now: Date = new Date(), expenses: PaidExpense[] = [], allDebts: Debt[] = debts): DebtSummary {
  const views = debts.map((d) => debtView(d, payments, now, expenses, allDebts)).sort((a, b) => b.debt.monthly_rate - a.debt.monthly_rate)
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
          : `La cuota no cubre ni los intereses (~${money(v.monthlyInterest)} al mes). Paga más que la cuota para que baje.`,
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
      title: `Paguen primero **${focus.debt.name}**`,
      detail: `Es la que más interés cobra (${pctText(focus.debt.monthly_rate)} mensual). Cualquier plata extra rinde más si la usan ahí.`,
    })
  }
  if (interest > 0) {
    findings.push({
      level: interest > monthly * 0.4 ? 'bad' : 'warn',
      title: 'Parte de lo que pagan se va en intereses',
      detail: `Unos ${money(interest)} al mes, el ${monthly > 0 ? Math.round((interest * 100) / monthly) : 0} % de sus cuotas.`,
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

/**
 * Cuánto de las cuotas me toca: lo mío completo y mi parte de lo compartido.
 * Cada deuda cuenta su cuota o, si este mes se pagó más (o no tiene cuota anotada), lo realmente pagado este mes:
 * así un pago nunca se pierde ni se cuenta dos veces. Una deuda saldada este mes sigue contando lo que se pagó.
 */
export function myDebtShare(debts: Debt[], payments: DebtPayment[], meId: string, split: Split, now: Date, expenses: PaidExpense[]): number {
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return Math.round(
    sumBy(debts, (d) => {
      const paidNow = sumBy(
        payments.filter((p) => p.debt_id === d.id && p.paid_on.startsWith(prefix)),
        (p) => p.amount,
      )
      if (debtView(d, payments, now, expenses, debts).remaining <= 0 && paidNow <= 0) return 0
      const fee = Math.max(d.monthly_payment, paidNow)
      return d.owner_id === meId ? fee : d.owner_id === null ? portion(fee, split, meId) : 0
    }),
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
      detail: `Entre gastos, cuotas y los ${money(saved)} que apartaste ya pasaste tu sueldo en ${money(-free)}. Esa diferencia salió de ahorros anteriores o hay que ajustar el mes.`,
    })
  } else if (free < 0) {
    level = 'bad'
    headline = 'Ya gastaste más de lo que ganas este mes'
    findings.push({
      level: 'bad',
      title: 'Estás sobre tu sueldo',
      detail: `Gastos${saved > 0 ? ', ahorro' : ''} y cuotas superan tu sueldo en ${money(-free)}.`,
    })
  } else if (realFree < 0) {
    level = 'bad'
    headline = 'Lo que te queda no alcanza para tus gastos fijos'
    findings.push({
      level: 'bad',
      title: 'Te faltará para tus fijos',
      detail: `Te quedan ${money(free)} pero aún vencen ${money(pendingFixed)} en gastos fijos: faltarían ${money(-realFree)}. No gastes en otra cosa.`,
    })
  } else if (projectedFree !== null && projectedFree < 0) {
    level = 'bad'
    headline = 'A este ritmo no te alcanza'
    findings.push({
      level: 'bad',
      title: 'Vas a pasarte de tu sueldo',
      detail: `Al cierre te faltarían ~${money(-projectedFree)}. Baja el ritmo${safeDaily !== null ? ` a ${money(safeDaily)} al día` : ''}.`,
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
          ? `Ya apartaste ${money(saved)} y te quedarían ~${money(outlook)} más a fin de mes.`
          : `Te quedarían ~${money(outlook)} a fin de mes.`,
    })
  }

  if (commitments > 0) {
    if (debtPct > 40) {
      if (level !== 'bad') level = 'bad'
      findings.push({
        level: 'bad',
        title: `Tus deudas se llevan el ${debtPct} % del sueldo`,
        detail: 'Sobre 40 % cuesta mucho pagar. Conviene bajar las cuotas o el interés.',
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

/* ---------- Modelo de dos cuentas: débito y tarjeta de crédito ---------- */

/** Lo mínimo de un gasto que usan estas cuentas: sirve el gasto completo (Expense) o el del historial */
export type PaidExpense = Pick<Expense, 'amount' | 'shared' | 'paid_by' | 'spent_on'> & { payment_method?: string | null; card_debt_id?: string | null }

/** Un gasto con tarjeta de crédito no baja la débito: sube lo usado de la tarjeta */
export function isCardExpense(e: { payment_method?: string | null }): boolean {
  return e.payment_method === 'tarjeta'
}

/** Mi parte (como myShare de analysis.ts) de lo comprado con tarjeta; con `month`, solo ese mes */
export function myCardSpent(expenses: PaidExpense[], meId: string, split: Split, month?: Date): number {
  const prefix = month ? monthPrefixOf(month) : ''
  return sumBy(
    expenses.filter((e) => isCardExpense(e) && e.spent_on.startsWith(prefix)),
    (e) => (e.shared ? portion(e.amount, split, meId) : e.paid_by === meId ? e.amount : 0),
  )
}

/** Lo pagado a deudas este mes que me corresponde (mía 100 %, sin dueño según el reparto) */
export function myDebtPaidThisMonth(debts: Debt[], payments: DebtPayment[], meId: string, split: Split, now: Date = new Date()): number {
  const prefix = monthPrefixOf(now)
  return Math.round(
    sumBy(debts, (d) => ownerShare(sumBy(payments.filter((p) => p.debt_id === d.id && p.paid_on.startsWith(prefix)), (p) => p.amount), d.owner_id, meId, split)),
  )
}

/** Cuota que falta pagar este mes (me corresponde): cuota − pagado, sin pasar del saldo; solo deudas con saldo */
export function myDebtDue(debts: Debt[], payments: DebtPayment[], meId: string, split: Split, now: Date, expenses: PaidExpense[]): number {
  return Math.round(
    sumBy(debts, (d) => {
      const v = debtView(d, payments, now, expenses, debts)
      if (v.remaining <= 0) return 0
      return ownerShare(Math.min(v.remaining, Math.max(0, d.monthly_payment - v.paidThisMonth)), d.owner_id, meId, split)
    }),
  )
}

/**
 * Compras con tarjeta cargadas a esta tarjeta; sin tarjeta asignada, van a la única tarjeta del hogar (con varias, a ninguna).
 * Si esa única tarjeta es de una persona, no se le cargan compras que pagó otra.
 */
export function cardCharges<E extends PaidExpense = Expense>(debt: Debt, expenses: E[], allDebts: Debt[]): E[] {
  if (!isCard(debt)) return []
  const cards = allDebts.filter((d) => isCard(d) && d.id !== debt.id).length + 1
  const soleOwner = debt.owner_id
  return expenses.filter((e) => {
    if (!isCardExpense(e)) return false
    if (e.card_debt_id) return e.card_debt_id === debt.id
    return cards === 1 && (soleOwner == null || e.paid_by === soleOwner)
  })
}

/** Compras con tarjeta que ninguna tarjeta registrada se lleva (sin tarjetas, con varias sin elegir o de otro dueño); con `month`, solo ese mes */
export function unassignedCardExpenses<E extends PaidExpense = Expense>(expenses: E[], debts: Debt[], month?: Date): E[] {
  const prefix = month ? monthPrefixOf(month) : ''
  const cards = debts.filter(isCard)
  return expenses.filter((e) => isCardExpense(e) && e.spent_on.startsWith(prefix) && !cards.some((c) => cardCharges(c, [e], debts).length > 0))
}

/** Compras con tarjeta que sí quedan cargadas a alguna tarjeta registrada */
function assignedCardExpenses<E extends PaidExpense>(expenses: E[], debts: Debt[]): E[] {
  const cards = debts.filter(isCard)
  return expenses.filter((e) => isCardExpense(e) && cards.some((c) => cardCharges(c, [e], debts).length > 0))
}

/**
 * Desde cuándo hay que traer las compras con tarjeta para calcular el saldo de las tarjetas: la fecha más antigua entre el saldo informado
 * (o el alta, si no tiene) de cada una. No depende del mes que se mira. null si no hay tarjetas.
 */
export function cardsSince(debts: Debt[]): string | null {
  const dates = debts.filter(isCard).map((d) => cardBalanceStart(d))
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b))
}

/** Fecha (AAAA-MM-DD) desde la que cuentan las compras de esta tarjeta: el saldo informado o, sin él, el alta (en fecha local) */
function cardBalanceStart(debt: Debt): string {
  if (debt.reported_balance != null && debt.reported_at) return debt.reported_at.slice(0, 10)
  // created_at viene en UTC: se compara con la fecha local en que se anotaron las compras
  const created = new Date(debt.created_at)
  return Number.isNaN(created.getTime()) ? debt.created_at.slice(0, 10) : toISO(created)
}

/** Montos que se ofrecen al pagar una deuda: la cuota (sin pasar del saldo; null si no hay cuota) y el saldo completo */
export function debtPayChips(monthlyPayment: number, remaining: number): { fee: number | null; all: number } {
  return { fee: monthlyPayment > 0 ? Math.min(monthlyPayment, remaining) : null, all: remaining }
}

export interface CardBalance {
  /** Lo usado de la tarjeta según las reglas */
  used: number
  /** Tiene saldo informado por el banco */
  informed: boolean
  informedAt: string | null
  /** Compras con tarjeta posteriores al saldo informado */
  sinceInformed: number
}

/**
 * Saldo de una tarjeta, sin interés automático (lo cobra el banco). Con saldo informado: ese saldo + compras
 * posteriores − pagos desde esa fecha (el del mismo día incluido). Sin él: lo anotado + compras desde el alta − pagos. Nunca bajo 0.
 */
export function cardBalance(debt: Debt, payments: DebtPayment[], expenses: PaidExpense[], allDebts: Debt[]): CardBalance {
  const charges = cardCharges(debt, expenses, allDebts)
  const mine = payments.filter((p) => p.debt_id === debt.id)
  const informed = debt.reported_balance != null && !!debt.reported_at
  const from = cardBalanceStart(debt)
  if (informed) {
    const since = sumBy(charges.filter((e) => e.spent_on > from), (e) => e.amount)
    const paidAfter = sumBy(mine.filter((p) => p.paid_on >= from), (p) => p.amount)
    return { used: Math.max(0, (debt.reported_balance ?? 0) + since - paidAfter), informed: true, informedAt: from, sinceInformed: since }
  }
  const spent = sumBy(charges.filter((e) => e.spent_on >= from), (e) => e.amount)
  return { used: Math.max(0, debt.original_amount + spent - sumBy(mine, (p) => p.amount)), informed: false, informedAt: null, sinceInformed: 0 }
}

export interface CardLimitStatus {
  limit: number
  used: number
  /** Lo que queda de cupo (0 si se pasó) */
  free: number
  /** Cuánto se pasó del cupo (0 si no se pasó) */
  over: number
  /** % usado del cupo, redondeado */
  pct: number
}

/** Cupo total de una tarjeta frente a lo usado. El usado puede superar el cupo. Sin cupo (o 0) no hay nada que mostrar. Solo informativo. */
export function cardLimitStatus(debt: Debt, used: number): CardLimitStatus | null {
  const limit = debt.credit_limit
  if (!isCard(debt) || limit == null || !(limit > 0)) return null
  return { limit, used, free: Math.max(0, limit - used), over: Math.max(0, used - limit), pct: Math.round((used * 100) / limit) }
}

/** Máximo de dígitos del cupo total (la base lo acota igual; así se avisa antes de enviar) */
export const CREDIT_LIMIT_MAX_DIGITS = 10

/** Lo que deja escribir el campo de cupo: un dígito más del máximo, para poder avisar en vez de cortar en silencio */
export const creditLimitInput = (raw: string): string => digitsOnly(raw, CREDIT_LIMIT_MAX_DIGITS + 1)

/** Aviso en español si el cupo escrito no cabe; null si está bien o vacío */
export function creditLimitProblem(raw: string): string | null {
  return raw.replace(/\D/g, '').length > CREDIT_LIMIT_MAX_DIGITS ? `El cupo no es válido. Escribe hasta ${CREDIT_LIMIT_MAX_DIGITS} dígitos.` : null
}

/** La clave credit_limit solo viaja si el usuario la escribió o la cambió, para no romper contra una base sin la columna. Un cupo de más de 10 dígitos no viaja (el formulario ya lo avisó con creditLimitProblem) */
export function creditLimitPatch(raw: string, existing?: Pick<Debt, 'credit_limit'>): { credit_limit?: number | null } {
  if (creditLimitProblem(raw)) return {}
  const n = Number(raw.replace(/\D/g, ''))
  const before = existing?.credit_limit ?? null
  if (raw.trim() === '' || n <= 0) return before != null ? { credit_limit: null } : {}
  return n === before ? {} : { credit_limit: n }
}

type DbError = { code?: string; message?: string } | null | undefined

/** El servidor aún no tiene (o no deja escribir) la columna credit_limit. Un check fallido (23514) NO cuenta: el cupo era inválido */
export function isMissingCreditLimitColumn(err: DbError): boolean {
  if (!err) return false
  if (err.code === 'PGRST204' || err.code === '42703') return true
  return err.code === '42501' && /column/i.test(err.message ?? '')
}

/** La base rechazó el cupo por fuera de rango (check debts_credit_limit_rango) */
export function isInvalidCreditLimit(err: DbError): boolean {
  return !!err && err.code === '23514' && /credit_limit/i.test(err.message ?? '')
}

/** Texto para la persona cuando falla guardar una deuda */
export function debtSaveMessage(err: DbError): string {
  return isInvalidCreditLimit(err) ? 'El cupo no es válido. Revisa el monto e intenta de nuevo.' : 'No se pudo guardar la deuda. Revisa tu conexión e intenta de nuevo.'
}

/** Guarda una deuda; si el servidor no conoce credit_limit, reintenta una vez sin esa clave para no perder la deuda. Un cupo inválido (23514) devuelve el error: nunca se guarda en silencio sin cupo */
export async function saveDebtKeepingData<E extends { code?: string; message?: string }>(
  run: (fields: Record<string, unknown>) => PromiseLike<{ error: E | null }>,
  fields: Record<string, unknown>,
): Promise<{ error: E | null; droppedLimit: boolean }> {
  const first = await run(fields)
  if (!first.error || !('credit_limit' in fields) || !isMissingCreditLimitColumn(first.error)) return { error: first.error, droppedLimit: false }
  const { credit_limit: _omit, ...rest } = fields
  void _omit
  const second = await run(rest)
  return { error: second.error, droppedLimit: !second.error }
}

/**
 * Al editar una deuda: en una tarjeta «Lo que falta pagar» es el cupo utilizado que dice el banco hoy, así que queda
 * como saldo informado de hoy (si cambió respecto de lo que se mostraba, o si la tarjeta aún no tenía uno).
 * Si no, el monto anotado sumaría otra vez las compras desde el alta, que el banco ya incluye. Sin cambios: no se toca.
 */
export function cardEditReport(existing: Debt | undefined, kind: string, total: number, shown: number | null, today: string): { reported_balance?: number; reported_at?: string } {
  if (kind !== 'tarjeta') return {}
  const informed = existing != null && isCard(existing) && existing.reported_balance != null && !!existing.reported_at
  if (informed && total === shown) return {}
  return { reported_balance: total, reported_at: today }
}

/** Una tarjeta activa con ese mismo nombre (sin distinguir mayúsculas ni espacios), para no anotarla dos veces */
export function sameNameCard(debts: Debt[], name: string): Debt | null {
  const key = name.trim().toLocaleLowerCase('es-CL')
  return debts.find((d) => isCard(d) && !d.archived && d.name.trim().toLocaleLowerCase('es-CL') === key) ?? null
}

/** Comisión mensual de administración por plan, en UF (informativa: el banco la cobra solo si el ciclo tiene movimientos ≥ $10.000) */
export const CMR_ADMIN_UF = { clasica: 0.135, premium: 0.22, elite: 0.35 } as const

export function cardMonthlyFee(kind: keyof typeof CMR_ADMIN_UF, ufValue: number): number {
  return Math.round(CMR_ADMIN_UF[kind] * ufValue)
}

/**
 * Lo que entra en «te queda del sueldo» (igual en todas las pantallas): gasto sin las compras con tarjeta que sí se cargan a una tarjeta (las demás cuentan como gasto normal),
 * lo realmente pagado a deudas en el mes y la cuota que falta (por pagar, solo en el mes en curso).
 */
export function salaryFlows(o: { expenses: PaidExpense[]; /** Compras con tarjeta desde el saldo informado (no solo las del mes): de ahí sale lo que falta de cada cuota */ cardExpenses: PaidExpense[]; debts: Debt[]; debtPayments: DebtPayment[]; meId: string; split: Split; month: Date; now?: Date; trueCost: number }): { spent: number; commitments: number; pendingDebt: number } {
  const now = o.now ?? new Date()
  return {
    spent: Math.max(0, Math.round(o.trueCost - myCardSpent(assignedCardExpenses(o.expenses, o.debts), o.meId, o.split, o.month))),
    commitments: myDebtPaidThisMonth(o.debts, o.debtPayments, o.meId, o.split, o.month),
    pendingDebt: isCurrentMonth(o.month, now) ? myDebtDue(o.debts, o.debtPayments, o.meId, o.split, now, o.cardExpenses) : 0,
  }
}
