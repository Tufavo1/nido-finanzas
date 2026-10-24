import { describe, expect, it } from 'vitest'
import { analyzeExpenses } from './expenseAnalysis'
import type { ExpRow, ExpenseInput } from './expenseAnalysis'

const NOW = new Date(2026, 9, 20) // 20 de octubre (martes)
const OCT = new Date(2026, 9, 1)
const cats = [
  { id: 'c1', name: 'Supermercado', monthly_budget: 0 },
  { id: 'c2', name: 'Ocio', monthly_budget: 100_000 },
]
let n = 0
const e = (amount: number, spent_on: string, o: Partial<ExpRow> = {}): ExpRow => ({
  id: `e${++n}`,
  amount,
  spent_on,
  note: null,
  category_id: 'c1',
  paid_by: 'a',
  shared: false,
  recurring_id: null,
  ...o,
})
const run = (history: ExpRow[], over: Partial<ExpenseInput> = {}) =>
  analyzeExpenses({ history, month: OCT, now: NOW, categories: cats, recurring: [], who: 'all', ...over })

describe('Gastos fuera de lo normal', () => {
  const normal = [30_000, 32_000, 28_000, 31_000, 29_000].map((a, i) => e(a, `2026-0${5 + i}-10`))

  it('detecta un gasto 3 veces mayor a lo típico de su categoría', () => {
    const r = run([...normal, e(150_000, '2026-10-05', { note: 'Fiesta' })])
    expect(r.unusual).toHaveLength(1)
    expect(r.unusual[0]?.label).toBe('Fiesta')
    expect(r.unusual[0]?.typical).toBe(30_000)
  })

  it('no marca como raro un gasto parecido a lo normal', () => expect(run([...normal, e(45_000, '2026-10-05')]).unusual).toHaveLength(0))

  it('con poco historial no opina', () => expect(run([e(30_000, '2026-09-10'), e(500_000, '2026-10-05')]).unusual).toHaveLength(0))

  it('un gasto fijo nunca es «inusual»', () => expect(run([...normal, e(150_000, '2026-10-05', { recurring_id: 'r' })]).unusual).toHaveLength(0))
})

describe('Posibles duplicados', () => {
  it('mismo monto, categoría y persona en días seguidos', () => {
    const r = run([e(25_000, '2026-10-05', { note: 'Super' }), e(25_000, '2026-10-06', { note: 'Super' })])
    expect(r.duplicates).toHaveLength(1)
    expect(r.duplicates[0]?.dates).toHaveLength(2)
  })

  it('si están separados por varios días no son duplicados', () =>
    expect(run([e(25_000, '2026-10-01'), e(25_000, '2026-10-09')]).duplicates).toHaveLength(0))

  it('si pagó otra persona no son duplicados', () =>
    expect(run([e(25_000, '2026-10-05'), e(25_000, '2026-10-05', { paid_by: 'b' })]).duplicates).toHaveLength(0))

  it('montos chicos se ignoran', () => expect(run([e(1_500, '2026-10-05'), e(1_500, '2026-10-05')]).duplicates).toHaveLength(0))
})

describe('Suscripciones sin marcar', () => {
  const netflix = (m: number, amount = 9_990) => e(amount, `2026-${String(m).padStart(2, '0')}-12`, { note: 'Netflix', category_id: 'c2' })

  it('la misma nota y monto durante 3 meses parece un gasto fijo', () => {
    const r = run([netflix(8), netflix(9), netflix(10)])
    expect(r.subscriptions[0]).toMatchObject({ label: 'Netflix', amount: 9_990, months: 3 })
  })

  it('si ya es un gasto fijo no se sugiere', () =>
    expect(run([netflix(8), netflix(9), netflix(10)], { recurring: [{ note: 'netflix', active: true }] }).subscriptions).toHaveLength(0))

  it('con montos muy distintos no es suscripción', () =>
    expect(run([netflix(8, 5_000), netflix(9, 20_000), netflix(10, 50_000)]).subscriptions).toHaveLength(0))

  it('compras variables como el súper no se confunden con una suscripción', () => {
    const super_ = (m: number, a: number) => e(a, `2026-${String(m).padStart(2, '0')}-05`, { note: 'Super' })
    expect(run([super_(7, 180_000), super_(8, 205_000), super_(9, 230_000), super_(10, 260_000)]).subscriptions).toHaveLength(0)
  })

  it('con solo 2 meses no alcanza', () => expect(run([netflix(9), netflix(10)]).subscriptions).toHaveLength(0))
})

describe('Ritmo frente al presupuesto', () => {
  it('avisa que el tope se acabaría antes de fin de mes', () => {
    const r = run([e(80_000, '2026-10-10', { category_id: 'c2' })]) // 80.000 en 20 días: cierra en ~124.000
    expect(r.pace[0]).toMatchObject({ name: 'Ocio', status: 'will' })
    expect(r.pace[0]?.hitDay).toBe(25) // 100.000 / 80.000 * 20
  })

  it('marca las que ya se pasaron', () => {
    const r = run([e(120_000, '2026-10-10', { category_id: 'c2' })])
    expect(r.pace[0]?.status).toBe('over')
    expect(r.findings[0]?.level).toBe('bad')
  })

  it('una categoría tranquila queda en ok', () => {
    const r = run([e(20_000, '2026-10-10', { category_id: 'c2' })])
    expect(r.pace[0]?.status).toBe('ok')
  })

  it('al mirar a una persona no hay presupuestos (son del hogar)', () => expect(run([e(120_000, '2026-10-10', { category_id: 'c2' })], { who: 'a' }).pace).toHaveLength(0))
})

describe('Ritmo y hábitos', () => {
  it('días con gasto, racha sin gastar y ticket promedio', () => {
    const r = run([e(10_000, '2026-10-02'), e(20_000, '2026-10-03'), e(30_000, '2026-10-15')])
    expect(r.rhythm).toMatchObject({ spendDays: 3, quietStreak: 5, avgTicket: 20_000, count: 3 })
  })

  it('filtra por persona', () => {
    const r = run([e(10_000, '2026-10-02'), e(90_000, '2026-10-03', { paid_by: 'b' })], { who: 'a' })
    expect(r.rhythm?.count).toBe(1)
    expect(r.top[0]?.amount).toBe(10_000)
  })

  it('sin gastos en el mes no hay análisis', () => expect(run([]).hasData).toBe(false))
})
