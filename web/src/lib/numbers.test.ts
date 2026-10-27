import { describe, expect, it } from 'vitest'
import { buildAnalysis } from './analysis'
import type { AnalysisInput, HistExpense } from './analysis'
import { buildNumbers } from './numbers'

const NOW = new Date(2026, 9, 20) // 20 de octubre
const OCT = new Date(2026, 9, 1)
const cats = [
  { id: 'c1', name: 'Supermercado', monthly_budget: 0 },
  { id: 'c2', name: 'Ocio', monthly_budget: 0 },
]
const exp = (amount: number, spent_on: string, o: Partial<HistExpense> = {}): HistExpense => ({
  amount,
  spent_on,
  category_id: 'c1',
  paid_by: 'a',
  shared: false,
  recurring_id: null,
  ...o,
})
const base = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({
  meId: 'a',
  memberCount: 2,
  month: OCT,
  now: NOW,
  history: [],
  categories: cats,
  salary: null,
  incomes: [],
  debts: [],
  debtPayments: [],
  contributions: [],
  goals: [{ id: 'fund', name: 'Fondo de emergencia' }],
  recurring: [],
  ...over,
})
const run = (over: Partial<AnalysisInput> = {}) => {
  const input = base(over)
  return buildNumbers(input, buildAnalysis(input))
}

describe('Tu mes en números', () => {
  it('sin sueldo no hay flujo', () => expect(run({ history: [exp(100_000, '2026-10-02')] }).flow).toBeNull())

  it('reparte cada $100 entre gastos, cuotas y lo que sobra', () => {
    const n = run({ salary: { amount: 1_000_000 }, history: [exp(300_000, '2026-10-02')] })
    expect(n.flow?.spent).toBe(300_000)
    expect(n.flow?.per100).toEqual({ spent: 30, debts: 0, pending: 0, saved: 0, left: 70 })
    expect(n.flow?.free).toBe(700_000)
    expect(n.flow?.over).toBe(false)
  })

  it('si gastas más de lo que ganas lo marca y lo que sobra no baja de 0', () => {
    const n = run({ salary: { amount: 100_000 }, history: [exp(150_000, '2026-10-02')] })
    expect(n.flow?.over).toBe(true)
    expect(n.flow?.per100.left).toBe(0)
    expect(n.flow?.free).toBe(-50_000)
  })

  it('gasto por día = lo gastado entre los días que van', () => {
    const n = run({ salary: { amount: 1_000_000 }, history: [exp(200_000, '2026-10-02')] })
    expect(n.flow?.dailyAvg).toBe(10_000) // 200.000 / 20 días
  })
})

describe('Frente al mes pasado', () => {
  it('en el mes en curso compara con el mismo tramo del mes anterior', () => {
    const n = run({
      history: [
        exp(100_000, '2026-09-05'), // dentro de los primeros 20 días
        exp(500_000, '2026-09-28'), // después del día 20: no cuenta
        exp(150_000, '2026-10-03'),
      ],
    })
    expect(n.changes?.before).toBe(100_000)
    expect(n.changes?.diff).toBe(50_000)
    expect(n.changes?.pct).toBe(50)
    expect(n.changes?.label).toBe('hasta el día 20 de septiembre')
  })

  it('en un mes cerrado compara con el mes anterior completo', () => {
    const n = run({
      month: new Date(2026, 8, 1),
      history: [exp(100_000, '2026-08-05'), exp(80_000, '2026-08-28'), exp(90_000, '2026-09-10')],
    })
    expect(n.changes?.before).toBe(180_000)
    expect(n.changes?.diff).toBe(-90_000)
    expect(n.changes?.label).toBe('en agosto')
  })

  it('ordena las categorías por cuánto cambiaron e ignora lo menor a $5.000', () => {
    const n = run({
      history: [
        exp(100_000, '2026-09-05'),
        exp(100_000, '2026-10-03'),
        exp(80_000, '2026-10-04', { category_id: 'c2' }),
        exp(2_000, '2026-10-05', { category_id: 'c2' }),
      ],
    })
    expect(n.changes?.items.map((i) => i.name)).toEqual(['Ocio'])
    expect(n.changes?.items[0]?.pct).toBeNull() // antes era cero
  })

  it('sin mes anterior no hay comparación', () => expect(run({ history: [exp(100_000, '2026-10-03')] }).changes).toBeNull())
})

describe('Fijos y variables', () => {
  it('separa lo que viene de gastos fijos', () => {
    const n = run({
      salary: { amount: 1_000_000 },
      history: [exp(400_000, '2026-10-01', { recurring_id: 'r1' }), exp(100_000, '2026-10-05')],
    })
    expect(n.fixedVar).toEqual({ fixed: 400_000, variable: 100_000, fixedPct: 80, fixedOfIncome: 40 })
  })

  it('sin gastos fijos no hay tarjeta', () => expect(run({ history: [exp(100_000, '2026-10-05')] }).fixedVar).toBeNull())

  it('un gasto fijo compartido cuenta solo tu mitad', () => {
    const n = run({ history: [exp(400_000, '2026-10-01', { recurring_id: 'r1', shared: true })] })
    expect(n.fixedVar?.fixed).toBe(200_000)
  })
})

describe('Colchón', () => {
  it('calcula la meta de 3 y 6 meses y en cuánto tiempo llegas', () => {
    const n = run({
      salary: { amount: 1_000_000 },
      history: [exp(200_000, '2026-09-05'), exp(200_000, '2026-10-03')],
      contributions: [{ user_id: 'a', goal_id: 'fund', amount: 100_000, contributed_on: '2026-01-15' }],
    })
    expect(n.cushion?.target3).toBe(600_000)
    expect(n.cushion?.target6).toBe(1_200_000)
    expect(n.cushion?.saved).toBe(100_000)
    expect(n.cushion?.covered).toBeCloseTo(0.5)
    expect(n.cushion?.monthsTo3).toBeGreaterThan(0)
  })

  it('si ya llegaste a la meta no hay meses pendientes', () => {
    const n = run({
      salary: { amount: 1_000_000 },
      history: [exp(100_000, '2026-09-05'), exp(100_000, '2026-10-03')],
      contributions: [{ user_id: 'a', goal_id: 'fund', amount: 900_000, contributed_on: '2026-01-15' }],
    })
    expect(n.cushion?.monthsTo3).toBeNull()
  })

  it('sin gastos no hay colchón que calcular', () => expect(run().cushion).toBeNull())
})

describe('Tus meses en números', () => {
  const h = [
    exp(100_000, '2026-05-10'),
    exp(100_000, '2026-06-10'),
    exp(200_000, '2026-07-10'),
    exp(300_000, '2026-08-10'),
    exp(400_000, '2026-09-10'),
    exp(50_000, '2026-10-03'),
  ]

  it('promedio, mes más caro y más barato, sin contar el mes en curso', () => {
    const n = run({ history: h })
    expect(n.history?.avg).toBe(220_000)
    expect(n.history?.high.amount).toBe(400_000)
    expect(n.history?.low.amount).toBe(100_000)
    expect(n.history?.yearly).toBe(2_640_000)
  })

  it('la tendencia compara los últimos 3 meses con los anteriores', () => {
    expect(run({ history: h }).history?.trendPct).toBe(200) // (200+300+400)/3 = 300 frente a 100
  })

  it('con un solo mes cerrado no hay resumen', () =>
    expect(run({ history: [exp(100_000, '2026-09-10'), exp(50_000, '2026-10-03')] }).history).toBeNull())
})

describe('Día de la semana', () => {
  it('con pocos gastos no opina', () => expect(run({ history: [exp(10_000, '2026-10-03')] }).weekday).toBeNull())

  it('señala el día donde más se gasta', () => {
    // 10 gastos; el 2026-10-03 es sábado
    const h = Array.from({ length: 9 }, (_, i) => exp(10_000, `2026-10-0${(i % 2) + 3}`)) // sábados y domingos
    h.push(exp(90_000, '2026-10-03'))
    const n = run({ history: h })
    expect(n.weekday?.name).toBe('sábados')
    expect(n.weekday?.pct).toBeGreaterThan(50)
  })
})
