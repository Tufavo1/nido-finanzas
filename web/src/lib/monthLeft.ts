// Copyright (c) 2026 Dinovance
// «Cuánto te queda del mes» después de guardar un movimiento detectado. Lógica pura.
import type { Debt, DebtPayment, HouseholdData } from './data'
import { monthIncome, myDebtDue, myDebtPaidThisMonth } from './finance'
import type { PaidExpense } from './finance'
import { savedInMonth } from './goals'
import { monthKey, myMonthCost, salaryLeft, salaryPicture } from './monthFigures'
import type { Split } from './split'

export type MonthEffect = 'income' | 'expense' | 'debt' | 'newdebt'

/**
 * Lo que queda del mes si se guarda el movimiento. null si no hay dato de sueldo (no se inventa nada).
 * `debtImpact`: lo que el pago agrega a las cuotas del mes (ver debtPayImpact); una deuda nueva no trae cuota, así que resta lo pagado.
 */
export function monthLeftAfter(free: number | null, effect: MonthEffect, amount: number, debtImpact = 0): number | null {
  if (free === null || !Number.isFinite(free)) return null
  if (effect === 'income') return free + amount
  if (effect === 'expense' || effect === 'newdebt') return free - amount
  return free - debtImpact
}

/**
 * Cuánto baja lo que te queda al registrar este pago: lo pagado sube y la cuota por pagar baja, así que
 * un pago que cabe en la cuota del mes (ya reservada como por pagar) no cambia nada; lo que pasa de la cuota sí.
 * `expenses`: compras con tarjeta desde el saldo informado (de ahí sale el saldo de las tarjetas).
 */
export function debtPayImpact(debts: Debt[], payments: DebtPayment[], debtId: string, amount: number, meId: string, split: Split, expenses: PaidExpense[], now: Date = new Date()): number {
  const debt = debts.find((d) => d.id === debtId)
  if (!debt) return 0
  const fake = { id: '__nuevo__', household_id: debt.household_id, debt_id: debtId, amount, paid_by: meId, paid_on: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, created_at: now.toISOString() } as DebtPayment
  const load = (ps: DebtPayment[]) => myDebtPaidThisMonth(debts, ps, meId, split, now) + myDebtDue(debts, ps, meId, split, now, expenses)
  return load([...payments, fake]) - load(payments)
}

/**
 * Lo que te queda hoy del mes: la MISMA cifra de Inicio (`salaryPicture` + `salaryLeft`, de monthFigures).
 * null si no hay sueldo o los datos del mes aún no cargan: entonces no se muestra nada.
 */
export function monthFreeNow(data: Pick<HouseholdData, 'salary' | 'incomes' | 'expenses' | 'cardExpenses' | 'debts' | 'debtPayments' | 'contributions' | 'recurring' | 'ready' | 'financeReady'>, meId: string, split: Split, now: Date = new Date()): number | null {
  if (!data.ready || !data.financeReady || !data.salary) return null
  const month = new Date(now.getFullYear(), now.getMonth(), 1)
  const { sal } = salaryPicture({
    expenses: data.expenses,
    cardExpenses: data.cardExpenses,
    debts: data.debts,
    debtPayments: data.debtPayments,
    recurring: data.recurring,
    meId,
    split,
    month,
    now,
    income: monthIncome(data.salary, data.incomes),
    cost: myMonthCost(data.expenses, meId, split),
    saved: savedInMonth(data.contributions, meId, monthKey(month)),
  })
  return salaryLeft(sal).amount
}
