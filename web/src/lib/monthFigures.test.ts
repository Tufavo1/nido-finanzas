// Coherencia entre pantallas: con los mismos datos, Inicio, Gastos y Análisis dicen las mismas cifras. Datos sintéticos.
import { describe, expect, it } from 'vitest'
import { buildAnalysis } from './analysis'
import type { AnalysisInput, HistExpense } from './analysis'
import type { Category, Debt, DebtPayment, Expense, Recurring } from './data'
import { monthIncome } from './finance'
import { salaryBreakdown, salaryLeft } from './monthFigures'
import { groupByCategory, myMonthCost, REMOVED_CATEGORY_ID, REMOVED_CATEGORY_NAME, salaryPicture } from './monthFigures'
import { computeMetrics } from './metrics'
import { buildNumbers } from './numbers'
import { scopeExpenses } from './scope'
import { splitOf } from './split'
import { topCategories } from './homeSummary'
import type { Member } from './ui'

const ME = 'persona-a'
const OTHER = 'persona-b'
const NOW = new Date(2026, 10, 23) // 23 de noviembre
const NOV = new Date(2026, 10, 1)

const members = [
  { user_id: ME, display_name: 'Ana', color: 'blue', share_pct: null },
  { user_id: OTHER, display_name: 'Beto', color: 'amber', share_pct: null },
] as unknown as Member[]

const categories = [
  { id: 'otros', name: 'Otros', monthly_budget: 0 },
  { id: 'super', name: 'Supermercado', monthly_budget: 0 },
] as unknown as Category[]

let n = 0
const exp = (amount: number, category_id: string, o: Partial<Expense> = {}): Expense =>
  ({
    id: `g-${++n}`,
    household_id: 'h',
    category_id,
    amount,
    paid_by: ME,
    shared: false,
    note: null,
    spent_on: '2026-11-05',
    recurring_id: null,
    created_at: '2026-11-05T12:00:00Z',
    created_by: ME,
    ...o,
  }) as Expense

const card: Debt = {
  id: 'tarjeta-1',
  household_id: 'h',
  name: 'Tarjeta',
  kind: 'tarjeta',
  owner_id: ME,
  original_amount: 0,
  monthly_payment: 0,
  monthly_rate: 0,
  due_day: null,
  archived: false,
  created_at: '2026-10-01T12:00:00Z',
} as Debt
const loan: Debt = { ...card, id: 'credito-1', name: 'Crédito', kind: 'consumo', original_amount: 3_000_000, monthly_payment: 150_001 } as Debt
const payment = { id: 'p1', household_id: 'h', debt_id: 'credito-1', amount: 150_001, paid_by: ME, paid_on: '2026-11-10', created_at: '2026-11-10T12:00:00Z' } as DebtPayment
const fixed = { id: 'r1', household_id: 'h', category_id: 'super', amount: 13_001, shared: false, paid_by: ME, day_of_month: 28, active: true, starts_on: '2026-01-01', last_applied: null, note: 'Gimnasio' } as unknown as Recurring

// Personales, compartidos (monto impar), cuotas de deuda, tarjeta, un gasto fijo anotado y dos categorías borradas
const expenses: Expense[] = [
  exp(10_001, 'otros'),
  exp(30_001, 'otros', { paid_by: OTHER, created_by: OTHER }),
  exp(50_001, 'super', { shared: true }),
  exp(12_001, 'borrada-1', { shared: true, paid_by: OTHER, created_by: OTHER }),
  exp(20_001, 'borrada-2'),
  exp(15_001, 'super', { payment_method: 'tarjeta', card_debt_id: 'tarjeta-1' }),
  exp(9_001, 'super', { recurring_id: 'r1' }),
]
const split = splitOf(members)
const hist = expenses as unknown as HistExpense[]
const input: AnalysisInput = {
  meId: ME,
  memberCount: split,
  month: NOV,
  cardExpenses: hist,
  now: NOW,
  history: hist,
  categories: categories as AnalysisInput['categories'],
  salary: { amount: 2_000_000 },
  incomes: [],
  debts: [card, loan],
  debtPayments: [payment],
  contributions: [],
  goals: [],
  recurring: [fixed],
}

describe('categorías sin nombre', () => {
  it('todas las eliminadas se agrupan en una sola línea con nombre claro', () => {
    const rows = groupByCategory(expenses, categories)
    const removed = rows.filter((r) => r.id === REMOVED_CATEGORY_ID)
    expect(removed).toHaveLength(1)
    expect(removed[0]!.name).toBe(REMOVED_CATEGORY_NAME)
    expect(removed[0]!.spent).toBe(12_001 + 20_001)
  })
  it('las categorías suman exactamente el total (nada queda sin explicar)', () => {
    const m = computeMetrics(expenses, [], categories, members, NOV, NOW)
    expect(m.byCategory.reduce((s, c) => s + c.spent, 0)).toBe(m.total)
  })
  it('Análisis nombra una sola vez la categoría eliminada', () => {
    const a = buildAnalysis(input)
    expect(a.slices.filter((s) => s.name === REMOVED_CATEGORY_NAME)).toHaveLength(1)
    expect(a.slices.some((s) => s.name === 'Otra categoría')).toBe(false)
  })
})

describe('coherencia Inicio / Gastos / Análisis', () => {
  const home = computeMetrics(expenses, [], categories, members, NOV, NOW)
  const gastos = computeMetrics(scopeExpenses(expenses, 'all', split), [], categories, members, NOV, NOW)
  const a = buildAnalysis(input)
  const nums = buildNumbers(input, a)
  const mine = home.people.find((p) => p.userId === ME)!
  const myView = computeMetrics(scopeExpenses(expenses, ME, split), [], categories, members, NOV, NOW)

  it('el total del mes es el mismo en Inicio y en Gastos', () => {
    expect(home.total).toBe(gastos.total)
    expect(home.total).toBe(expenses.reduce((s, e) => s + e.amount, 0))
  })
  it('el costo real de Análisis es tu parte de Inicio/Gastos (mismo redondeo)', () => {
    expect(a.cost).toBe(myMonthCost(expenses, ME, split))
    expect(a.cost).toBe(myView.total)
    expect(Math.abs(a.cost - mine.trueCost)).toBeLessThanOrEqual(1)
  })
  it('lo que suman las categorías de Análisis es su total', () => {
    expect(a.slices.reduce((s, c) => s + c.amount, 0)).toBe(a.cost)
  })
  it('«Otros» de tu vista (Inicio/Gastos) es el mismo de Análisis', () => {
    const otrosInicio = topCategories(myView.byCategory, myView.total, false, 10).find((c) => c.name === 'Otros')
    const otrosAnalisis = a.slices.find((s) => s.name === 'Otros')
    expect(otrosInicio?.spent).toBe(otrosAnalisis?.amount)
    expect(otrosInicio?.spent).toBe(10_001)
  })
  it('«Te queda» sale de la misma cuenta en las tres pantallas', () => {
    const pic = salaryPicture({
      expenses,
      cardExpenses: expenses,
      debts: input.debts,
      debtPayments: input.debtPayments,
      recurring: input.recurring,
      meId: ME,
      split,
      month: NOV,
      now: NOW,
      income: monthIncome(input.salary, input.incomes),
      cost: myMonthCost(expenses, ME, split),
      saved: 0,
    })
    expect(pic.sal.realFree).toBe(nums.flow!.realFree)
    expect(pic.sal.free).toBe(nums.flow!.free)
    expect(pic.pendingFixed).toBe(nums.flow!.pendingFixed)
    expect(pic.pendingFixed).toBeGreaterThan(0)
    // La cifra que se muestra (y su nombre) es una sola: la de Inicio
    const shown = salaryLeft(nums.flow!)
    expect(shown.amount).toBe(Math.round(pic.sal.realFree))
    expect(shown.label).toBe('Te queda')
    expect(salaryLeft({ realFree: nums.flow!.free }).label).toBe('Te queda')
  })
  it('las compras con tarjeta y las cuotas pagadas no cambian el total pero sí lo libre', () => {
    expect(nums.flow!.commitments).toBe(150_001)
    expect(nums.flow!.cardSpent).toBe(15_001)
    expect(nums.flow!.spent + nums.flow!.cardSpent).toBe(a.cost)
  })
})

describe('salaryBreakdown: la resta que explica «Te queda»', () => {
  it('ganas 1.307.186, gastos 276.636 y 13.000 por pagar dan 1.017.550', () => {
    const f = { income: 1_307_186, spent: 276_636, commitments: 0, saved: 0, pendingFixed: 13_000, realFree: 1_017_550 }
    expect(salaryBreakdown(f)).toBe('Ganas $1.307.186 − Gastos $276.636 − Fijos y cuotas por pagar $13.000 = Te queda $1.017.550')
  })
  it('omite lo que es cero y rotula igual «Te queda» si no hay nada por pagar', () => {
    const f = { income: 1_000_000, spent: 300_000, commitments: 50_000, saved: 20_000, pendingFixed: 0, realFree: 630_000 }
    expect(salaryBreakdown(f)).toBe('Ganas $1.000.000 − Gastos $300.000 − Cuotas pagadas $50.000 − Ahorro apartado $20.000 = Te queda $630.000')
  })
  it('un resultado negativo lleva el signo delante del peso', () => {
    const f = { income: 100_000, spent: 112_990, commitments: 0, saved: 0, pendingFixed: 0, realFree: -12_990 }
    expect(salaryBreakdown(f)).toContain('= Te queda -$12.990')
  })
})
