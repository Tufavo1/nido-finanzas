// Modelo de dos cuentas (débito y tarjeta de crédito). Ver REQUISITOS-debito-tarjeta.md. Datos sintéticos.
import { describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[] }))
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        db.inserted.push(row)
        return Promise.resolve({ error: null, status: 201 })
      },
    }),
  },
}))

import { buildAnalysis } from './analysis'
import type { AnalysisInput, HistExpense } from './analysis'
import { BACKUP_TABLES, restoreExpenseRow } from './backup'
import { candidateToDraft } from './candidates'
import type { Debt, DebtPayment, Expense } from './data'
import { salaryAnalysisFor } from './engine'
import { reinsertExpense } from './expenseToDebtDb'
import {
  CMR_ADMIN_UF,
  cardBalance,
  cardCharges,
  cardMonthlyFee,
  debtView,
  isCardExpense,
  myCardSpent,
  myDebtDue,
  myDebtPaidThisMonth,
  myDebtShare,
  salaryFlows,
} from './finance'
import { expenseRow } from './inbox'
import { monthFreeNow } from './monthLeft'
import { movementExpenseDraft } from './movements'
import { draftPaymentMethod } from './nativeBridge'
import type { NativeDraft } from './nativeBridge'
import { buildNumbers } from './numbers'
import { insertExpenseRow } from './saveExpense'

const ME = 'persona-a'
const OTHER = 'persona-b'

const exp = (amount: number, spent_on: string, o: Partial<Expense> = {}): Expense => ({
  id: `g-${amount}-${spent_on}-${o.payment_method ?? 'd'}-${o.card_debt_id ?? ''}`,
  household_id: 'hogar-1',
  category_id: 'cat-1',
  amount,
  paid_by: ME,
  shared: false,
  note: null,
  spent_on,
  recurring_id: null,
  created_at: `${spent_on}T12:00:00Z`,
  created_by: ME,
  ...o,
})
const card = (amount: number, spent_on: string, o: Partial<Expense> = {}) => exp(amount, spent_on, { payment_method: 'tarjeta', ...o })

const debt = (o: Partial<Debt> = {}): Debt => ({
  id: 'tarjeta-1',
  household_id: 'hogar-1',
  name: 'Tarjeta demo',
  kind: 'tarjeta',
  owner_id: ME,
  original_amount: 0,
  monthly_payment: 0,
  monthly_rate: 0,
  due_day: null,
  archived: false,
  created_at: '2026-10-01T12:00:00Z',
  ...o,
})
const pay = (debt_id: string, amount: number, paid_on: string, o: Partial<DebtPayment> = {}): DebtPayment => ({
  id: `p-${debt_id}-${amount}-${paid_on}`,
  household_id: 'hogar-1',
  debt_id,
  amount,
  paid_by: ME,
  paid_on,
  created_at: `${paid_on}T12:00:00Z`,
  ...o,
})

describe('R1 isCardExpense', () => {
  it('R1 solo payment_method tarjeta es gasto con tarjeta', () => {
    expect(isCardExpense({ payment_method: 'tarjeta' })).toBe(true)
    expect(isCardExpense({ payment_method: 'debito' })).toBe(false)
    expect(isCardExpense({ payment_method: null })).toBe(false)
    expect(isCardExpense({})).toBe(false)
  })
})

describe('R2 myCardSpent', () => {
  const list = [exp(300_000, '2026-11-02'), card(200_000, '2026-11-05'), card(80_000, '2026-11-06', { shared: true }), card(50_000, '2026-10-30')]
  it('R2 suma mi parte de lo pagado con tarjeta y excluye el débito', () => {
    expect(myCardSpent(list, ME, 2)).toBe(200_000 + 40_000 + 50_000)
  })
  it('R2 con mes solo cuenta las compras con tarjeta de ese mes', () => {
    expect(myCardSpent(list, ME, 2, new Date(2026, 10, 1))).toBe(240_000)
    expect(myCardSpent(list, ME, 2, new Date(2026, 9, 1))).toBe(50_000)
  })
  it('R2 respeta el reparto acordado y lo personal de la otra persona no es mío', () => {
    expect(myCardSpent([card(100_000, '2026-11-05', { shared: true }), card(70_000, '2026-11-05', { paid_by: OTHER })], ME, { [ME]: 0.6, [OTHER]: 0.4 })).toBe(60_000)
  })
})

describe('R3 cardCharges', () => {
  const c1 = debt({ id: 'tarjeta-1' })
  const c2 = debt({ id: 'tarjeta-2' })
  const consumo = debt({ id: 'consumo-1', kind: 'consumo' })
  it('R3 con una sola tarjeta, el gasto con tarjeta sin asignar se asocia a ella', () => {
    const e = [card(10_000, '2026-11-02'), exp(5_000, '2026-11-02')]
    expect(cardCharges(c1, e, [c1, consumo]).map((x) => x.amount)).toEqual([10_000])
  })
  it('R3 con varias tarjetas, el gasto sin asignar no suma a ninguna; el asignado va a la suya', () => {
    const e = [card(10_000, '2026-11-02'), card(20_000, '2026-11-03', { card_debt_id: 'tarjeta-2' })]
    expect(cardCharges(c1, e, [c1, c2])).toEqual([])
    expect(cardCharges(c2, e, [c1, c2]).map((x) => x.amount)).toEqual([20_000])
  })
  it('R3 una deuda que no es tarjeta no tiene cargos', () => {
    expect(cardCharges(consumo, [card(10_000, '2026-11-02', { card_debt_id: 'consumo-1' })], [consumo])).toEqual([])
  })
})

describe('R4 cardBalance sin saldo informado', () => {
  it('R4 anotado + compras desde el alta − pagos, sin interés', () => {
    const d = debt({ original_amount: 100_000, monthly_rate: 3 })
    const e = [card(5_000, '2026-09-20'), card(30_000, '2026-10-05')]
    expect(cardBalance(d, [pay(d.id, 20_000, '2026-10-20')], e, [d])).toEqual({ used: 110_000, informed: false, informedAt: null, sinceInformed: 0 })
  })
  it('R4 nunca baja de 0', () => {
    const d = debt({ original_amount: 10_000 })
    expect(cardBalance(d, [pay(d.id, 50_000, '2026-10-20')], [], [d]).used).toBe(0)
  })
})

describe('R5 cardBalance con saldo informado', () => {
  const d = debt({ original_amount: 999_999, reported_balance: 300_000, reported_at: '2026-11-10' })
  it('R5 saldo informado + compras posteriores − pagos posteriores; lo anterior o del mismo día no se suma', () => {
    const e = [card(40_000, '2026-11-05'), card(10_000, '2026-11-10'), card(25_000, '2026-11-15')]
    const p = [pay(d.id, 100_000, '2026-11-08'), pay(d.id, 50_000, '2026-11-20')]
    expect(cardBalance(d, p, e, [d])).toEqual({ used: 275_000, informed: true, informedAt: '2026-11-10', sinceInformed: 25_000 })
  })
  it('R5 nunca baja de 0', () => {
    const low = debt({ reported_balance: 10_000, reported_at: '2026-11-10' })
    expect(cardBalance(low, [pay(low.id, 50_000, '2026-11-12')], [], [low]).used).toBe(0)
  })
})

describe('R6 debtView', () => {
  const now = new Date(2026, 3, 15)
  const base = { original_amount: 100_000, monthly_rate: 2, monthly_payment: 10_000, created_at: '2026-01-10T12:00:00Z' }
  it('R6 la tarjeta no acumula interés compuesto mientras el consumo sí', () => {
    const consumo = debtView(debt({ ...base, id: 'c', kind: 'consumo' }), [], now)
    const tarjeta = debtView(debt({ ...base, id: 't', kind: 'tarjeta' }), [], now)
    expect(consumo.accrued).toBeGreaterThan(0)
    expect(consumo.remaining).toBeGreaterThan(100_000)
    expect(tarjeta.accrued).toBe(0)
    expect(tarjeta.remaining).toBe(100_000)
  })
  it('R6 la tarjeta usa cardBalance con los gastos y deudas que se le pasan', () => {
    const t = debt({ ...base, reported_balance: 50_000, reported_at: '2026-04-01' })
    const v = debtView(t, [pay(t.id, 5_000, '2026-04-10')], now, [card(20_000, '2026-04-05')], [t])
    expect(v.remaining).toBe(65_000)
    expect(v.paidThisMonth).toBe(5_000)
  })
  it('R6 hipotecario y otro siguen exactamente como antes (accruedBalance)', () => {
    for (const kind of ['hipotecario', 'otro', 'consumo']) {
      const d = debt({ ...base, kind })
      expect(debtView(d, [], now, [card(20_000, '2026-04-05', { card_debt_id: d.id })], [d])).toEqual(debtView(d, [], now))
    }
  })
})

describe('R7 myDebtPaidThisMonth', () => {
  const now = new Date(2026, 10, 20)
  const mine = debt({ id: 'mia', kind: 'consumo', owner_id: ME, original_amount: 1_000_000, monthly_payment: 100_000 })
  const shared = debt({ id: 'comun', kind: 'consumo', owner_id: null, original_amount: 1_000_000, monthly_payment: 80_000 })
  const theirs = debt({ id: 'ajena', kind: 'consumo', owner_id: OTHER, original_amount: 1_000_000, monthly_payment: 50_000 })
  const payments = [pay('mia', 30_000, '2026-11-05'), pay('comun', 80_000, '2026-11-06'), pay('ajena', 50_000, '2026-11-07'), pay('mia', 99_000, '2026-10-05')]
  it('R7 cuenta lo realmente pagado este mes (no max(cuota, pagado) como myDebtShare)', () => {
    expect(myDebtShare([mine], payments, ME, 2, now)).toBe(100_000)
    expect(myDebtPaidThisMonth([mine], payments, ME, 2, now)).toBe(30_000)
  })
  it('R7 mía 100 %, sin dueño según el reparto, de la otra persona 0', () => {
    expect(myDebtPaidThisMonth([mine, shared, theirs], payments, ME, 2, now)).toBe(30_000 + 40_000)
    expect(myDebtPaidThisMonth([mine, shared, theirs], payments, ME, { [ME]: 0.25, [OTHER]: 0.75 }, now)).toBe(30_000 + 20_000)
  })
})

describe('R8 myDebtDue', () => {
  const now = new Date(2026, 10, 20)
  const d = (o: Partial<Debt>) => debt({ kind: 'consumo', original_amount: 1_000_000, monthly_payment: 100_000, ...o })
  it('R8 cuota − pagado de este mes', () => {
    expect(myDebtDue([d({ id: 'x' })], [pay('x', 30_000, '2026-11-02')], ME, 2, now)).toBe(70_000)
  })
  it('R8 es 0 si ya pagó la cuota o si el saldo es 0', () => {
    expect(myDebtDue([d({ id: 'x' })], [pay('x', 100_000, '2026-11-02')], ME, 2, now)).toBe(0)
    expect(myDebtDue([d({ id: 'y', original_amount: 50_000 })], [pay('y', 50_000, '2026-10-02')], ME, 2, now)).toBe(0)
  })
  it('R8 se reparte igual que lo pagado y no pasa del saldo', () => {
    expect(myDebtDue([d({ id: 'c', owner_id: null })], [], ME, 2, now)).toBe(50_000)
    expect(myDebtDue([d({ id: 'o', owner_id: OTHER })], [], ME, 2, now)).toBe(0)
    expect(myDebtDue([d({ id: 's', original_amount: 20_000 })], [], ME, 2, now)).toBe(20_000)
  })
  it('R8 una tarjeta usa su saldo con las compras con tarjeta', () => {
    const t = debt({ monthly_payment: 100_000 })
    expect(myDebtDue([t], [], ME, 2, now)).toBe(0)
    expect(myDebtDue([t], [], ME, 2, now, [card(50_000, '2026-11-03')])).toBe(50_000)
  })
})

describe('R9 comisión de administración', () => {
  it('R9 UF del plan × valor UF, redondeada', () => {
    expect(CMR_ADMIN_UF).toEqual({ clasica: 0.135, premium: 0.22, elite: 0.35 })
    expect(cardMonthlyFee('clasica', 40_000)).toBe(5_400)
    expect(cardMonthlyFee('premium', 40_000)).toBe(8_800)
    expect(cardMonthlyFee('elite', 40_001)).toBe(14_000)
  })
})

describe('R10 medio de pago del borrador', () => {
  it('R10 tarjeta solo con CREDIT', () => {
    expect(draftPaymentMethod({ medium: 'CREDIT' })).toBe('tarjeta')
    expect(draftPaymentMethod({ medium: 'DEBIT' })).toBe('debito')
    expect(draftPaymentMethod({ medium: 'UNKNOWN' })).toBe('debito')
    expect(draftPaymentMethod({ medium: null })).toBe('debito')
    expect(draftPaymentMethod({})).toBe('debito')
  })
  const nd = (o: Partial<NativeDraft>): NativeDraft => ({
    id: 'b1', amountClp: 12_000, merchant: 'Comercio Demo', kind: 'EXPENSE', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: Date.UTC(2026, 10, 5, 15), createdAtMillis: 1, status: 'PENDING', ...o,
  })
  const opts = { paidBy: ME, shared: false, categories: [], history: [] }
  it('R10 un gasto detectado con CREDIT llega al formulario como tarjeta; con DEBIT o sin dato no cambia', () => {
    expect(candidateToDraft(nd({ medium: 'CREDIT' }), opts).paymentMethod).toBe('tarjeta')
    expect(candidateToDraft(nd({ medium: 'DEBIT' }), opts)).not.toHaveProperty('paymentMethod')
    expect(candidateToDraft(nd({}), opts)).not.toHaveProperty('paymentMethod')
  })
  it('R10 un pago o transferencia detectado no se marca como compra con tarjeta', () => {
    expect(movementExpenseDraft(nd({ kind: 'DEBT_PAYMENT', medium: 'CREDIT' }), opts, 'cat-1').paymentMethod).toBeUndefined()
  })
})

describe('R11 fila del gasto al guardar', () => {
  const form = { amount: 12_000, note: 'Compra demo', spent_on: '2026-11-05', shared: false, paid_by: ME, category_id: 'cat-1' }
  it('R11 con tarjeta manda payment_method y card_debt_id', () => {
    expect(expenseRow('hogar-1', 'id-1', { ...form, paymentMethod: 'tarjeta', cardDebtId: 'tarjeta-1' }, ME)).toMatchObject({ payment_method: 'tarjeta', card_debt_id: 'tarjeta-1' })
    expect(expenseRow('hogar-1', 'id-1', { ...form, paymentMethod: 'tarjeta' }, ME)).toMatchObject({ payment_method: 'tarjeta', card_debt_id: null })
  })
  it('R11 con débito no manda ninguno (aunque venga una tarjeta)', () => {
    for (const f of [form, { ...form, paymentMethod: 'debito' as const, cardDebtId: 'tarjeta-1' }]) {
      const row = expenseRow('hogar-1', 'id-1', f, ME)
      expect(row).not.toHaveProperty('payment_method')
      expect(row).not.toHaveProperty('card_debt_id')
    }
  })
  it('R11 el guardado envía la fila de tarjeta tal cual y la de débito sin esos campos', async () => {
    db.inserted.length = 0
    await insertExpenseRow(expenseRow('hogar-1', 'id-t', { ...form, paymentMethod: 'tarjeta', cardDebtId: 'tarjeta-1' }, ME))
    await insertExpenseRow(expenseRow('hogar-1', 'id-d', form, ME))
    expect(db.inserted[0]).toMatchObject({ id: 'id-t', payment_method: 'tarjeta', card_debt_id: 'tarjeta-1' })
    expect(db.inserted[1]).not.toHaveProperty('payment_method')
  })
})

describe('R12 reinsertar y restaurar', () => {
  it('R12 deshacer devuelve el gasto con su medio de pago y tarjeta', async () => {
    db.inserted.length = 0
    await reinsertExpense(card(10_000, '2026-11-05', { card_debt_id: 'tarjeta-1' }), [debt()])
    expect(db.inserted[0]).toMatchObject({ payment_method: 'tarjeta', card_debt_id: 'tarjeta-1' })
  })
  it('R12 si la tarjeta ya no existe, card_debt_id va en null', async () => {
    db.inserted.length = 0
    await reinsertExpense(card(10_000, '2026-11-05', { card_debt_id: 'tarjeta-borrada' }), [debt()])
    expect(db.inserted[0]).toMatchObject({ payment_method: 'tarjeta', card_debt_id: null })
  })
  it('R12 un respaldo viejo sin esos campos se restaura como débito', () => {
    const old = { id: 'g1', amount: 5_000, spent_on: '2026-01-02' }
    expect(restoreExpenseRow(old, new Set())).toEqual({ ...old, payment_method: 'debito', card_debt_id: null })
    expect(restoreExpenseRow({ ...old, payment_method: 'tarjeta', card_debt_id: 't9' }, new Set(['t9']))).toMatchObject({ payment_method: 'tarjeta', card_debt_id: 't9' })
    expect(restoreExpenseRow({ ...old, payment_method: 'tarjeta', card_debt_id: 't9' }, new Set())).toMatchObject({ card_debt_id: null })
  })
  it('R12 al restaurar, las deudas van antes que los gastos', () => {
    expect(BACKUP_TABLES.indexOf('debts')).toBeLessThan(BACKUP_TABLES.indexOf('expenses'))
  })
})

describe('R13 salaryFlows', () => {
  const NOV = new Date(2026, 10, 1)
  const now = new Date(2026, 10, 20)
  const t = debt({ monthly_payment: 200_000 })
  const expenses = [exp(300_000, '2026-11-02'), card(200_000, '2026-11-03')]
  const debtPayments = [pay(t.id, 150_000, '2026-11-04')]
  it('R13 spent sin tarjeta, commitments lo pagado y pendingDebt lo que falta de la cuota', () => {
    expect(salaryFlows({ expenses, debts: [t], debtPayments, meId: ME, split: 2, month: NOV, now, trueCost: 500_000 })).toEqual({ spent: 300_000, commitments: 150_000, pendingDebt: 50_000 })
  })
  it('R13 spent nunca es negativo y en un mes pasado no hay cuota pendiente', () => {
    const r = salaryFlows({ expenses, debts: [t], debtPayments, meId: ME, split: 2, month: NOV, now: new Date(2026, 11, 5), trueCost: 100_000 })
    expect(r).toEqual({ spent: 0, commitments: 150_000, pendingDebt: 0 })
  })
})

/** Escenario realista sintético del dueño (R14, R15, R16) */
describe('R14-R16 escenario completo', () => {
  const NOV = new Date(2026, 10, 1)
  const now = new Date(2026, 10, 3) // día 3: aún no se proyecta el mes
  const make = (cuota: number) => {
    const t = debt({ monthly_payment: cuota, monthly_rate: 2.5 })
    const expenses = [exp(300_000, '2026-11-01'), card(200_000, '2026-11-02')]
    const debtPayments = [pay(t.id, 150_000, '2026-11-02')]
    return { t, expenses, debtPayments }
  }
  const salary = { amount: 1_000_000 }

  const viaMonthLeft = (cuota: number) => {
    const { t, expenses, debtPayments } = make(cuota)
    const data = { ready: true, financeReady: true, salary, incomes: [], expenses, debts: [t], debtPayments, contributions: [], recurring: [] }
    return monthFreeNow(data as never, ME, 2, now)
  }
  const analysisInput = (cuota: number): AnalysisInput => {
    const { t, expenses, debtPayments } = make(cuota)
    return {
      meId: ME, memberCount: 2, month: NOV, now, history: expenses as HistExpense[], categories: [{ id: 'cat-1', name: 'Supermercado', monthly_budget: 0 }],
      salary, incomes: [], debts: [t], debtPayments, contributions: [], goals: [], recurring: [],
    }
  }
  const viaEngine = (cuota: number) => {
    const { t, expenses, debtPayments } = make(cuota)
    const me = { user_id: ME, display_name: 'Persona A', color: 'blue', household_id: 'hogar-1', joined_at: '' }
    const hh = { household: { id: 'hogar-1', name: 'Hogar demo', invite_code: null, created_at: '' }, members: [me, { ...me, user_id: OTHER, display_name: 'Persona B' }], me }
    const data = { categories: [{ id: 'cat-1', name: 'Supermercado', monthly_budget: 0, position: 0, archived: false, household_id: 'hogar-1' }], expenses, prevExpenses: [], goals: [], contributions: [], debts: [t], debtPayments, salary, incomes: [], recurring: [], profiles: [], financeReady: true, ready: true }
    return salaryAnalysisFor(hh as never, data as never, NOV, now)
  }

  it('R15 te queda 550.000 (no 500.000) y la tarjeta sube 200.000 − 150.000', () => {
    expect(viaMonthLeft(150_000)).toBe(550_000)
    const { t, expenses, debtPayments } = make(150_000)
    expect(debtView(t, debtPayments, now, expenses, [t]).remaining).toBe(50_000)
    expect(cardBalance(t, debtPayments, expenses, [t]).used).toBe(50_000)
  })
  it('R14 Números, Análisis, Avisos y el monto tras guardar dan el mismo «te queda»', () => {
    const input = analysisInput(150_000)
    const a = buildAnalysis(input)
    expect(a.free).toBe(550_000)
    expect(buildNumbers(input, a).flow?.free).toBe(550_000)
    expect(viaEngine(150_000)?.free).toBe(550_000)
    expect(viaMonthLeft(150_000)).toBe(550_000)
  })
  it('R14 lo que falta de la cuota queda por pagar: no baja lo que queda hoy, sí lo que es tuyo', () => {
    const input = analysisInput(200_000)
    const flow = buildNumbers(input, buildAnalysis(input)).flow
    expect(flow?.free).toBe(550_000)
    expect(flow?.commitments).toBe(150_000)
    expect(flow?.pendingFixed).toBe(50_000)
    expect(viaEngine(200_000)?.realFree).toBe(500_000)
    expect(viaMonthLeft(200_000)).toBe(500_000)
  })
  it('R16 las compras con tarjeta siguen en el gasto del mes y sus categorías', () => {
    const a = buildAnalysis(analysisInput(150_000))
    expect(a.cost).toBe(500_000)
    expect(a.slices.find((s) => s.id === 'cat-1')?.amount).toBe(500_000)
  })
})
