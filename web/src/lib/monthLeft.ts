// Copyright (c) 2026 Dinovance
// «Cuánto te queda del mes» después de guardar un movimiento detectado. Lógica pura.
import { monthKey, myShare } from './analysis'
import type { HistExpense } from './analysis'
import type { Debt, DebtPayment, HouseholdData } from './data'
import { analyzeSalary, monthIncome, myDebtShare } from './finance'
import { savedInMonth } from './goals'
import type { Split } from './split'
import { pendingFixedThisMonth } from './upcoming'

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

/** Cuánto sube lo que se cuenta como cuotas del mes al registrar este pago (0 si cabe en la cuota ya descontada). */
export function debtPayImpact(debts: Debt[], payments: DebtPayment[], debtId: string, amount: number, meId: string, split: Split, now: Date = new Date()): number {
  const debt = debts.find((d) => d.id === debtId)
  if (!debt) return 0
  const fake = { id: '__nuevo__', household_id: debt.household_id, debt_id: debtId, amount, paid_by: meId, paid_on: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, created_at: now.toISOString() } as DebtPayment
  return myDebtShare(debts, [...payments, fake], meId, split, now) - myDebtShare(debts, payments, meId, split, now)
}

/**
 * Lo que te queda hoy del mes, igual que en Inicio (sueldo + ingresos extra - gastos - cuotas y pagos - ahorro - fijos que vienen).
 * null si no hay sueldo o los datos del mes aún no cargan: entonces no se muestra nada.
 */
export function monthFreeNow(data: Pick<HouseholdData, 'salary' | 'incomes' | 'expenses' | 'debts' | 'debtPayments' | 'contributions' | 'recurring' | 'ready' | 'financeReady'>, meId: string, split: Split, now: Date = new Date()): number | null {
  if (!data.ready || !data.financeReady || !data.salary) return null
  const month = new Date(now.getFullYear(), now.getMonth(), 1)
  const spent = data.expenses.reduce((s, e) => s + myShare(e as HistExpense, meId, split), 0)
  return analyzeSalary({
    income: monthIncome(data.salary, data.incomes),
    spent,
    commitments: myDebtShare(data.debts, data.debtPayments, meId, split, now),
    month,
    now,
    pendingFixed: pendingFixedThisMonth(data.recurring, meId, split, now),
    fixedBooked: data.expenses.reduce((s, e) => (e.recurring_id ? s + myShare(e, meId, split) : s), 0),
    saved: savedInMonth(data.contributions, meId, monthKey(month)),
  }).realFree
}
