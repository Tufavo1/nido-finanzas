import { describe, expect, it } from 'vitest'
import type { Debt } from './data'
import { buildPlan } from './advisor'
import type { PlanInput } from './advisor'
import { analyzeDebts, extraEffect } from './debtAnalysis'

const NOW = new Date(2026, 9, 20)
const card = { id: 't', household_id: 'h', name: 'Tarjeta', kind: 'tarjeta', owner_id: null, original_amount: 900_000, monthly_payment: 90_000, monthly_rate: 2.5, due_day: 10, archived: false, created_at: '' } as Debt
const input = (o: Partial<PlanInput> = {}): PlanInput => ({
  now: NOW,
  endOfMonth: 200_000,
  variableDaily: 30_000,
  income: 1_400_000,
  cushion: { saved: 100_000, covered: 0.5, target3: 900_000, target6: 1_800_000, monthsTo3: 4, monthsTo6: 9 },
  debtInsights: analyzeDebts([], [], NOW),
  debts: [],
  debtPayments: [],
  categories: [],
  ...o,
})
const withDebt = () => ({ debtInsights: analyzeDebts([card], [], NOW), debts: [card] })

describe('extra a la deuda', () => {
  it('pagar más termina antes y ahorra interés', () => {
    const e = extraEffect([card], [], 50_000, NOW)
    expect(e?.target).toBe('Tarjeta')
    expect(e?.monthsSaved).toBeGreaterThan(0)
    expect(e?.interestSaved).toBeGreaterThan(0)
  })
  it('sin deudas o sin extra no hay efecto', () => {
    expect(extraEffect([], [], 50_000, NOW)).toBeNull()
    expect(extraEffect([card], [], 0, NOW)).toBeNull()
  })
})

describe('plan con plata de sobra', () => {
  it('sin sueldo no hay plan', () => expect(buildPlan(input({ endOfMonth: null }))).toBeNull())

  it('sin deudas caras, prioriza el ahorro para imprevistos', () => {
    const p = buildPlan(input())
    expect(p?.kind).toBe('surplus')
    expect(p?.steps[0]?.key).toBe('imprevistos')
    expect(p?.steps.some((s) => s.key === 'deuda')).toBe(false)
  })

  it('con una deuda cara, el mayor abono va a la deuda y explica el ahorro', () => {
    const p = buildPlan(input({ ...withDebt() }))
    expect(p?.steps[0]?.key).toBe('deuda')
    expect(p?.steps[0]?.why).toContain('ahorras')
  })

  it('nunca reparte más de lo que sobra (deja un 10 % de resguardo)', () => {
    const p = buildPlan(input({ ...withDebt() }))
    const total = p?.steps.reduce((s, x) => s + x.amount, 0) ?? 0
    expect(total).toBeLessThanOrEqual(180_000)
  })

  it('con colchón sólido y sin deudas caras, va a metas y a disfrutar', () => {
    const p = buildPlan(input({ cushion: { saved: 2_000_000, covered: 6, target3: 900_000, target6: 1_800_000, monthsTo3: null, monthsTo6: null } }))
    expect(p?.steps.map((s) => s.key)).toEqual(['metas', 'libre'])
  })

  it('un sobrante mínimo no genera plan', () => expect(buildPlan(input({ endOfMonth: 8_000 }))).toBeNull())
})

describe('plan cuando falta plata', () => {
  const deficit = (o: Partial<PlanInput> = {}) => buildPlan(input({ endOfMonth: -110_000, ...o }))

  it('propone bajar el gasto diario lo justo para cubrir el faltante', () => {
    const p = deficit()
    expect(p?.kind).toBe('deficit')
    expect(p?.amount).toBe(110_000)
    // quedan 11 días: 110.000 / 11 = 10.000 menos por día
    expect(p?.steps[0]).toMatchObject({ key: 'ritmo' })
    expect(p?.steps[0]?.title).toContain('$20.000')
  })

  it('recorta solo categorías de gustos y no las básicas', () => {
    const p = deficit({ categories: [{ name: 'Supermercado', amount: 400_000 }, { name: 'Ocio', amount: 220_000 }] })
    const cuts = p?.steps.filter((s) => s.key === 'recorte') ?? []
    expect(cuts).toHaveLength(1)
    expect(cuts[0]?.title).toContain('Ocio')
  })

  it('con una deuda cara sugiere renegociar la tasa', () => {
    expect(deficit({ ...withDebt() })?.steps.some((s) => s.key === 'tasa')).toBe(true)
  })
})
