// Copyright (c) 2026 Dinovance
// El saldo de una tarjeta cuenta TODAS las compras con tarjeta desde el saldo informado, sin importar el mes que se mira.
// Caso real: saldo informado el 28-10 (1.056.339), compras el 29 y el 31-10, y hoy es 5-11.
import { describe, expect, it } from 'vitest'
import { mergeCardExpenses } from './data'
import { buildAlerts, salaryAnalysisFor } from './engine'
import { buildAnalysis } from './analysis'
import type { AnalysisInput, HistExpense } from './analysis'
import type { Debt, Expense } from './data'
import { cardBalance, cardsSince, debtView, summarizeDebts } from './finance'
import { monthFreeNow } from './monthLeft'
import { salaryLeft, salaryPicture, myMonthCost } from './monthFigures'
import { buildNumbers } from './numbers'
import { buildUpcoming } from './upcoming'

const ME = 'a'
const SALDO = 1_056_339
const now = new Date(2026, 10, 5, 12, 0)
const NOV = new Date(2026, 10, 1)
const OCT = new Date(2026, 9, 1)

const me = { user_id: ME, display_name: 'Ana', color: 'blue', household_id: 'h', joined_at: '' }
const hh = { household: { id: 'h', name: 'Casa', invite_code: null, created_at: '' }, members: [me], me, everyone: [me] } as never
const buy = (amount: number, spent_on: string, o: Partial<Expense> = {}): Expense => ({
  id: `g${amount}${spent_on}`, household_id: 'h', category_id: 'c1', amount, paid_by: ME, shared: false, note: null, spent_on,
  recurring_id: null, created_at: `${spent_on}T12:00:00Z`, created_by: ME, payment_method: 'tarjeta', ...o,
})
const cmr = (o: Partial<Debt> = {}): Debt => ({
  id: 'cmr', household_id: 'h', name: 'CMR', kind: 'tarjeta', owner_id: ME, original_amount: 900_000, monthly_payment: 100_000,
  monthly_rate: 0, due_day: 10, archived: false, created_at: '2026-08-10T15:00:00Z', reported_balance: SALDO, reported_at: '2026-10-28',
  credit_limit: 1_100_000, ...o,
})
const octPurchases = [buy(50_000, '2026-10-29'), buy(30_000, '2026-10-31')]
const base = {
  categories: [{ id: 'c1', name: 'Tienda', monthly_budget: 0, position: 0, archived: false, household_id: 'h' }],
  expenses: [] as Expense[], prevExpenses: [] as Expense[], cardExpenses: octPurchases, goals: [], contributions: [], debts: [cmr()], debtPayments: [],
  salary: { user_id: ME, household_id: 'h', amount: 2_000_000, pay_day: 28, updated_at: '' }, incomes: [], recurring: [], profiles: [],
  financeReady: true, financeStale: false, profileReady: true, ready: true,
}
const USED = SALDO + 80_000

describe('cardsSince: desde cuándo hay que traer las compras con tarjeta', () => {
  it('la fecha más antigua del saldo informado entre las tarjetas', () => {
    expect(cardsSince([cmr(), cmr({ id: 'b', reported_at: '2026-09-15' })])).toBe('2026-09-15')
  })
  it('sin saldo informado usa la fecha de alta; sin tarjetas, nada', () => {
    expect(cardsSince([cmr({ reported_balance: null, reported_at: null, created_at: '2026-08-10T15:00:00Z' })])).toBe('2026-08-10')
    expect(cardsSince([cmr({ kind: 'consumo' })])).toBeNull()
  })
})

describe('el saldo de la tarjeta no depende del mes que se mira', () => {
  it('cardBalance con las compras de octubre da 1.136.339 aunque hoy sea 5-11', () => {
    expect(cardBalance(cmr(), [], octPurchases, [cmr()]).used).toBe(USED)
  })
  it('avisos: la tarjeta pasa su cupo por $36.339 aunque los gastos del mes visible no tengan compras con tarjeta', () => {
    const list = buildAlerts(hh, base as never, NOV, now, {})
    expect(list.find((a) => a.id.startsWith('card-over:'))?.title).toContain('$36.339')
  })
  it('al navegar a octubre el saldo de la tarjeta sigue siendo 1.136.339 (no depende del mes visible)', () => {
    const octExpenses = [buy(10_000, '2026-10-10', { payment_method: 'debito' })]
    const data = { ...base, expenses: octExpenses }
    // cardExpenses es el mismo conjunto en cualquier mes: el saldo no cambia
    expect(summarizeDebts(data.debts, [], now, data.cardExpenses, data.debts).remaining).toBe(USED)
    expect(salaryAnalysisFor(hh, data as never, OCT, now)).not.toBeNull()
  })
  it('Te queda cuenta lo que falta de la cuota con las compras de octubre (cuota 100.000, saldo 20.000+50.000)', () => {
    const d = cmr({ reported_balance: 20_000, reported_at: '2026-10-28', credit_limit: null })
    const data = { ...base, debts: [d], cardExpenses: [buy(50_000, '2026-10-29')] }
    const motor = salaryAnalysisFor(hh, data as never, NOV, now)!
    // saldo 70.000 < cuota 100.000: por pagar 70.000 (antes 20.000)
    expect(motor.pendingFixed).toBe(70_000)
  })
  it('Análisis, Números y Deudas dan la misma deuda total', () => {
    const t = cmr()
    const input: AnalysisInput = {
      meId: ME, memberCount: 1, month: NOV, now, history: [] as HistExpense[], cardExpenses: octPurchases, categories: [], salary: { amount: 2_000_000 },
      incomes: [], debts: [t], debtPayments: [], contributions: [], goals: [], recurring: [],
    }
    const numbers = buildNumbers(input, buildAnalysis(input))
    expect(numbers.debts?.remaining).toBe(USED)
    expect(summarizeDebts([t], [], now, octPurchases, [t]).remaining).toBe(USED)
    expect(debtView(t, [], now, octPurchases, [t]).remaining).toBe(USED)
  })
  it('lo que vence (buildUpcoming): una tarjeta en 0 con compras de octubre sí tiene cuota por pagar', () => {
    const d = cmr({ reported_balance: 0, credit_limit: null, due_day: 10, monthly_payment: 40_000 })
    const up = (expenses: Expense[]) => buildUpcoming({ now, meId: ME, split: 1, recurring: [], debts: [d], debtPayments: [], expenses, salary: null, free: null, variableDaily: 0 })
    expect(up([buy(50_000, '2026-10-29')]).events.find((e) => e.kind === 'deuda')?.amount).toBe(40_000)
    expect(up([]).events.some((e) => e.kind === 'deuda')).toBe(false)
  })
})

describe('movimiento detectado: «te queda» es la cifra de Inicio', () => {
  const data = { ...base, expenses: [buy(25_000, '2026-11-02', { payment_method: 'debito' })], debts: [cmr({ credit_limit: null })] }
  it('monthFreeNow = salaryLeft de salaryPicture con las mismas entradas', () => {
    const cost = myMonthCost(data.expenses, ME, 1)
    const pic = salaryPicture({
      expenses: data.expenses, cardExpenses: data.cardExpenses, debts: data.debts, debtPayments: [], recurring: [], meId: ME, split: 1, month: NOV, now,
      income: 2_000_000, cost, saved: 0,
    })
    expect(monthFreeNow(data as never, ME, 1, now)).toBe(salaryLeft(pic.sal).amount)
  })
  it('con gastos que exceden el sueldo no pasa de los topes de Inicio (misma fórmula)', () => {
    const big = { ...data, salary: { ...data.salary, amount: 100_000 }, expenses: [buy(900_000, '2026-11-03', { payment_method: 'debito' })] }
    const pic = salaryPicture({
      expenses: big.expenses, cardExpenses: big.cardExpenses, debts: big.debts, debtPayments: [], recurring: [], meId: ME, split: 1, month: NOV, now,
      income: 100_000, cost: 900_000, saved: 0,
    })
    expect(monthFreeNow(big as never, ME, 1, now)).toBe(salaryLeft(pic.sal).amount)
  })
})

describe('mergeCardExpenses: lo recién guardado entra sin esperar la recarga', () => {
  it('suma las compras con tarjeta del mes a la vista que aún no llegaron, sin repetir ni traer débito', () => {
    const nueva = buy(7_000, '2026-11-04')
    const deb = buy(9_000, '2026-11-04', { payment_method: 'debito' })
    const out = mergeCardExpenses(octPurchases, [octPurchases[0]!, nueva, deb])
    expect(out.map((e) => e.amount)).toEqual([50_000, 30_000, 7_000])
  })
})
