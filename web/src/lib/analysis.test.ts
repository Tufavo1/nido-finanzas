import { describe, expect, it } from 'vitest'
import { buildAnalysis, isNeed, myShare } from './analysis'
import type { AnalysisInput, HistExpense } from './analysis'

const NOW = new Date(2026, 9, 20) // 20 de octubre: van 20 de 31 días
const OCT = new Date(2026, 9, 1)
const SEP = new Date(2026, 8, 1)

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
  recurring: [],
  ...over,
})
const SALARY = { amount: 1_000_000 }

describe('myShare: lo que te toca de cada gasto', () => {
  it('compartido en pareja: la mitad', () => expect(myShare(exp(100_000, '2026-10-01', { shared: true }), 'a', 2)).toBe(50_000))
  it('compartido a solas: completo', () => expect(myShare(exp(100_000, '2026-10-01', { shared: true }), 'a', 1)).toBe(100_000))
  it('personal tuyo: completo', () => expect(myShare(exp(30_000, '2026-10-01'), 'a', 2)).toBe(30_000))
  it('personal de tu pareja: nada', () => expect(myShare(exp(50_000, '2026-10-01', { paid_by: 'b' }), 'a', 2)).toBe(0))
})

describe('costo real y en qué se va', () => {
  const history = [
    exp(100_000, '2026-10-02', { shared: true, paid_by: 'b' }), // te toca 50.000 aunque lo pagó tu pareja
    exp(30_000, '2026-10-05', { category_id: 'c2' }),
    exp(50_000, '2026-10-06', { category_id: 'c2', paid_by: 'b' }), // personal de tu pareja: no es tuyo
  ]
  const a = buildAnalysis(base({ history }))

  it('suma lo personal tuyo y tu parte de lo compartido', () => expect(a.cost).toBe(80_000))
  it('ordena las categorías de mayor a menor', () => {
    expect(a.slices.map((s) => [s.name, s.amount, s.pct])).toEqual([
      ['Supermercado', 50_000, 63],
      ['Ocio', 30_000, 38],
    ])
  })
  it('proyecta el cierre del mes: 80.000 en 20 días son 124.000 en 31', () => expect(a.projected).toBe(124_000))
  it('sin sueldo no hay puntaje ni regla 50/30/20', () => {
    expect(a.score).toBeNull()
    expect(a.rule).toBeNull()
  })
})

describe('puntaje', () => {
  it('con sueldo alto y sin deudas: ahorro y deudas completos, colchón en cero', () => {
    const a = buildAnalysis(base({ salary: SALARY, history: [exp(80_000, '2026-10-03')] }))
    expect(a.score?.parts.find((p) => p.key === 'ahorro')?.points).toBe(40)
    expect(a.score?.parts.find((p) => p.key === 'deudas')?.points).toBe(25)
    expect(a.score?.parts.find((p) => p.key === 'colchon')?.points).toBe(0)
    expect(a.score?.value).toBe(76) // (40 + 25 + 0) de 85 posibles
    expect(a.score?.label).toBe('Buena')
  })

  it('gastando más de lo que ganas queda en riesgo', () => {
    const a = buildAnalysis(base({ salary: { amount: 100_000 }, history: [exp(300_000, '2026-10-03')] }))
    expect(a.score?.level).toBe('bad')
    expect(a.score?.parts.find((p) => p.key === 'ahorro')?.points).toBe(0)
    expect(a.insights[0]?.level).toBe('bad')
  })

  it('incluye el presupuesto solo si hay presupuestos definidos', () => {
    const sin = buildAnalysis(base({ salary: SALARY, history: [exp(80_000, '2026-10-03')] }))
    expect(sin.score?.parts.some((p) => p.key === 'presupuesto')).toBe(false)
    const con = buildAnalysis(
      base({ salary: SALARY, history: [exp(80_000, '2026-10-03')], categories: [{ id: 'c1', name: 'Supermercado', monthly_budget: 50_000 }] }),
    )
    const part = con.score?.parts.find((p) => p.key === 'presupuesto')
    expect(part?.points).toBe(0)
    expect(part?.level).toBe('bad')
  })
})

describe('regla 50/30/20', () => {
  it('separa necesidades y gustos y estima el cierre del mes', () => {
    const a = buildAnalysis(base({ salary: SALARY, history: [exp(200_000, '2026-10-03'), exp(100_000, '2026-10-04', { category_id: 'c2' })] }))
    // costo 300.000 en 20 días proyecta 465.000 (x1,55)
    expect(a.rule).toEqual({ needs: 310_000, wants: 155_000, savings: 535_000, income: 1_000_000 })
  })
  it('reconoce categorías típicas como necesidades', () => {
    expect(isNeed('Supermercado')).toBe(true)
    expect(isNeed('Hogar y cuentas')).toBe(true)
    expect(isNeed('Ocio')).toBe(false)
    expect(isNeed('Gimnasio')).toBe(false)
  })
})

describe('qué mejorar', () => {
  const prior = (amount: number) =>
    ['2026-07-10', '2026-08-10', '2026-09-10'].map((d) => exp(amount, d))

  it('detecta una categoría que ya superó tu mes típico', () => {
    const a = buildAnalysis(base({ history: [...prior(100_000), exp(160_000, '2026-10-05')] }))
    expect(a.insights.some((i) => i.title.includes('ya superó tu mes típico'))).toBe(true)
  })
  it('no molesta por variaciones chicas', () => {
    const a = buildAnalysis(base({ history: [...prior(100_000), exp(110_000, '2026-10-05')] }))
    expect(a.insights.some((i) => i.title.includes('superó'))).toBe(false)
  })
  it('detecta los gastos chicos que se acumulan', () => {
    const chicos = Array.from({ length: 9 }, (_, i) => exp(5_000, `2026-10-${String(i + 1).padStart(2, '0')}`, { category_id: 'c2' }))
    const a = buildAnalysis(base({ history: chicos }))
    expect(a.insights.find((i) => i.title.includes('gastos chicos'))?.detail).toContain('9 compras')
  })
  it('avisa si el colchón es corto y cómo llegar a 3 meses', () => {
    const a = buildAnalysis(base({ history: [...prior(100_000), exp(100_000, '2026-10-05')], contributions: [{ user_id: 'a', amount: 40_000 }] }))
    const f = a.insights.find((i) => i.title.startsWith('Tu colchón cubre'))
    expect(f?.level).toBe('bad') // 0,4 meses
    expect(f?.detail).toContain('3 meses')
  })
  it('lo que aportó tu pareja no cuenta como tu colchón', () => {
    const a = buildAnalysis(base({ history: [...prior(100_000), exp(100_000, '2026-10-05')], contributions: [{ user_id: 'b', amount: 900_000 }] }))
    expect(a.insights.find((i) => i.title.startsWith('Tu colchón cubre'))?.level).toBe('bad')
  })
  it('avisa cuando el gasto lleva 3 meses subiendo', () => {
    const h = [exp(100_000, '2026-07-10'), exp(120_000, '2026-08-10'), exp(140_000, '2026-09-10')]
    expect(buildAnalysis(base({ history: h })).insights.some((i) => i.title.includes('3 meses subiendo'))).toBe(true)
  })
  it('en un mes cerrado, celebra gastar menos que tu promedio', () => {
    const h = [exp(100_000, '2026-07-10'), exp(100_000, '2026-08-10'), exp(90_000, '2026-09-10')]
    const a = buildAnalysis(base({ month: SEP, history: h }))
    expect(a.insights.some((i) => i.title === 'Gastaste 10 % menos que tu promedio')).toBe(true)
  })
  it('ordena lo urgente primero', () => {
    const a = buildAnalysis(base({ salary: { amount: 100_000 }, history: [...prior(100_000), exp(300_000, '2026-10-03')] }))
    const ranks = a.insights.map((i) => ({ bad: 0, warn: 1, ok: 2 })[i.level])
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y))
  })
})

describe('resumen y casos borde', () => {
  it('sin gastos lo dice con claridad', () => {
    const a = buildAnalysis(base())
    expect(a.hasData).toBe(false)
    expect(a.summary).toContain('Aún no hay gastos tuyos')
    expect(a.insights).toHaveLength(0)
  })
  it('el resumen incluye el cierre estimado y cuánto sobra', () => {
    const a = buildAnalysis(base({ salary: SALARY, history: [exp(80_000, '2026-10-03')] }))
    expect(a.summary).toContain('costo real')
    expect(a.summary).toContain('te sobrarían')
  })
  it('agrupa en "otras categorías" lo que pasa de cinco', () => {
    const many = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map((c, i) => exp(10_000 * (i + 1), '2026-10-03', { category_id: c }))
    const a = buildAnalysis(base({ history: many }))
    expect(a.slices).toHaveLength(6)
    expect(a.slices[5]?.name).toBe('Otras categorías')
    expect(a.slices.reduce((s, x) => s + x.amount, 0)).toBe(a.cost)
  })
  it('la ventana tiene 6 meses y marca el actual', () => {
    const a = buildAnalysis(base())
    expect(a.months.map((m) => m.label)).toEqual(['may', 'jun', 'jul', 'ago', 'sep', 'oct'])
    expect(a.months.filter((m) => m.current)).toHaveLength(1)
  })
})
