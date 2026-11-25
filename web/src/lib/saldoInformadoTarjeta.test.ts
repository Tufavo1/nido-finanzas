// Tarjeta con saldo informado por el banco: lo que se debe hoy es EXACTAMENTE ese saldo en todas las vistas.
// Caso del dueño (cifras sintéticas): CMR con cupo utilizado 1.056.339 informado hoy. Ver REQUISITOS-debito-tarjeta.md (R5, R17-R19).
import { describe, expect, it } from 'vitest'
import { analyzeDebts } from './debtAnalysis'
import type { AnalysisInput, HistExpense } from './analysis'
import { buildAnalysis } from './analysis'
import type { Debt, DebtPayment, Expense } from './data'
import { cardBalance, cardEditReport, debtView, sameNameCard, summarizeDebts } from './finance'
import { buildNumbers } from './numbers'
import { scopeDebtShares } from './scope'

const ME = 'persona-a'
const OTHER = 'persona-b'
const TODAY = '2026-11-23'
const now = new Date(2026, 10, 23, 18, 0)
const SALDO = 1_056_339

const card = (amount: number, spent_on: string, o: Partial<Expense> = {}): Expense => ({
  id: `g-${amount}-${spent_on}`,
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
  payment_method: 'tarjeta',
  ...o,
})
const pay = (debt_id: string, amount: number, paid_on: string): DebtPayment => ({
  id: `p-${debt_id}-${amount}-${paid_on}`,
  household_id: 'hogar-1',
  debt_id,
  amount,
  paid_by: ME,
  paid_on,
  created_at: `${paid_on}T12:00:00Z`,
})
// Una CMR anotada hace meses, con tasa y cuota: nada de eso debe sumarse encima del saldo del banco
const cmr = (o: Partial<Debt> = {}): Debt => ({
  id: 'cmr',
  household_id: 'hogar-1',
  name: 'Banco Falabella · Tarjeta de crédito',
  kind: 'tarjeta',
  owner_id: ME,
  original_amount: 824_202,
  monthly_payment: 400_000,
  monthly_rate: 3.41,
  due_day: 5,
  archived: false,
  created_at: '2026-08-10T15:00:00Z',
  reported_balance: SALDO,
  reported_at: TODAY,
  ...o,
})
// Compras de este mes ya incluidas en el saldo que informa el banco
const earlier = [card(120_000, '2026-11-02'), card(45_000, '2026-11-15'), card(9_990, TODAY)]

const analysisInput = (debts: Debt[], payments: DebtPayment[], history: Expense[]): AnalysisInput => ({
  meId: ME,
  memberCount: 1,
  month: new Date(2026, 10, 1),
  now,
  history: history as HistExpense[],
  cardExpenses: history,
  categories: [{ id: 'cat-1', name: 'Tienda', monthly_budget: 0 }],
  salary: { amount: 2_000_000 },
  incomes: [],
  debts,
  debtPayments: payments,
  contributions: [],
  goals: [],
  recurring: [],
})

/** La cifra de la tarjeta en cada pantalla: detalle, lista, total, análisis y Números */
function everyFigure(t: Debt, payments: DebtPayment[], expenses: Expense[]) {
  const input = analysisInput([t], payments, expenses)
  return {
    cardBalance: cardBalance(t, payments, expenses, [t]).used,
    debtView: debtView(t, payments, now, expenses, [t]).remaining,
    total: summarizeDebts([t], payments, now, expenses, [t]).remaining,
    analysis: analyzeDebts([t], payments, now, expenses).costs[0]?.remaining,
    numbers: buildNumbers(input, buildAnalysis(input)).debts?.remaining,
  }
}
const all = (n: number) => ({ cardBalance: n, debtView: n, total: n, analysis: n, numbers: n })

describe('R17 saldo informado hoy = lo que se debe hoy, en todas las vistas', () => {
  it('R17 sin pagos ni compras posteriores: exactamente 1.056.339 (sin intereses, cuota ni monto anotado encima)', () => {
    expect(everyFigure(cmr(), [], earlier)).toEqual(all(SALDO))
    expect(debtView(cmr(), [], now, earlier, [cmr()]).accrued).toBe(0)
  })
  it('R17 los intereses se muestran aparte (estimación mensual) y no inflan lo que falta pagar', () => {
    const s = summarizeDebts([cmr()], [], now, earlier, [cmr()])
    expect(s.remaining).toBe(SALDO)
    expect(s.interest).toBe(Math.round((SALDO * 3.41) / 100))
    expect(s.monthly).toBe(400_000)
  })
  it('R17 un pago del mismo día resta (regla 1.3.2): 1.056.339 − 150 = 1.056.189', () => {
    expect(everyFigure(cmr(), [pay('cmr', 150, TODAY)], earlier)).toEqual(all(1_056_189))
  })
  it('R17 un pago anterior al informe ya está en el saldo del banco: no resta', () => {
    expect(everyFigure(cmr(), [pay('cmr', 50_000, '2026-11-20')], earlier)).toEqual(all(SALDO))
  })
  it('R17 solo las compras posteriores al informe suman', () => {
    const later = [...earlier, card(20_000, '2026-11-24')]
    const t = cmr()
    expect(cardBalance(t, [], later, [t]).used).toBe(SALDO + 20_000)
    expect(debtView(t, [], new Date(2026, 10, 24), later, [t]).remaining).toBe(SALDO + 20_000)
  })
})

describe('R18 editar «Lo que falta pagar» de una tarjeta deja ese monto como saldo informado', () => {
  // Tarjeta anotada sin saldo del banco (alta antigua o desde un aviso): sus compras desde el alta ya están en el saldo del banco
  const old = cmr({ reported_balance: null, reported_at: null })
  it('R18 sin el arreglo, poner 1.056.339 como monto anotado le suma las compras desde el alta', () => {
    const edited = { ...old, original_amount: SALDO }
    expect(cardBalance(edited, [], earlier, [edited]).used).toBeGreaterThan(SALDO)
  })
  it('R18 al cambiar el monto de una tarjeta, queda como saldo informado hoy y se ve exacto', () => {
    const shown = cardBalance(old, [], earlier, [old]).used
    const patch = cardEditReport(old, 'tarjeta', SALDO, shown, TODAY)
    expect(patch).toEqual({ reported_balance: SALDO, reported_at: TODAY })
    const edited = { ...old, original_amount: SALDO, ...patch }
    expect(everyFigure(edited, [], earlier)).toEqual(all(SALDO))
    expect(everyFigure(edited, [pay('cmr', 150, TODAY)], earlier)).toEqual(all(1_056_189))
  })
  it('R18 si no cambió el monto de una tarjeta ya informada, no se toca su saldo informado', () => {
    const t = cmr({ reported_at: '2026-11-10' })
    const shown = cardBalance(t, [], earlier, [t]).used
    expect(cardEditReport(t, 'tarjeta', shown, shown, TODAY)).toEqual({})
  })
  it('R18 una tarjeta sin saldo informado lo recibe aunque el monto no cambie; otra deuda no', () => {
    const shown = cardBalance(old, [], earlier, [old]).used
    expect(cardEditReport(old, 'tarjeta', shown, shown, TODAY)).toEqual({ reported_balance: shown, reported_at: TODAY })
    expect(cardEditReport({ ...old, kind: 'consumo' }, 'consumo', SALDO, null, TODAY)).toEqual({})
    expect(cardEditReport(undefined, 'tarjeta', SALDO, null, TODAY)).toEqual({ reported_balance: SALDO, reported_at: TODAY })
  })
})

describe('R19 la parte de una persona en una tarjeta compartida', () => {
  it('R19 el total de una persona es su parte del saldo informado (igual que Números), no el saldo completo', () => {
    const t = cmr({ owner_id: null })
    const payments = [pay('cmr', 150, TODAY)]
    const mine = scopeDebtShares([t], payments, ME, { [ME]: 0.5, [OTHER]: 0.5 })
    expect(summarizeDebts(mine.debts, mine.payments, now, earlier, [t]).remaining).toBe(Math.round(1_056_189 / 2))
  })
})

describe('R20 no anotar dos veces la misma tarjeta', () => {
  it('R20 avisa si ya hay una tarjeta activa con ese nombre', () => {
    const t = cmr()
    expect(sameNameCard([t], 'Banco Falabella · Tarjeta de crédito')?.id).toBe('cmr')
    expect(sameNameCard([t], '  banco falabella · tarjeta de crédito ')?.id).toBe('cmr')
    expect(sameNameCard([{ ...t, kind: 'consumo' }], 'Banco Falabella · Tarjeta de crédito')).toBeNull()
    expect(sameNameCard([t], 'Banco Estado · Tarjeta de crédito')).toBeNull()
  })
})
