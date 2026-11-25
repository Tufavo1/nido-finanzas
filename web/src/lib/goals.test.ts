import { describe, expect, it } from 'vitest'
import { goalProgress, goalSaved, goalsOverview } from './goals'

const now = new Date('2026-10-15T12:00:00')

describe('goalProgress', () => {
  it('marca cumplida una meta completa', () => {
    const p = goalProgress(100_000, null, [{ amount: 100_000, contributed_on: '2026-10-01' }], now)
    expect(p.state).toBe('done')
    expect(p.pct).toBe(100)
    expect(p.remaining).toBe(0)
  })

  it('sin fecha queda abierta', () => {
    const p = goalProgress(100_000, null, [{ amount: 25_000, contributed_on: '2026-10-01' }], now)
    expect(p.state).toBe('open')
    expect(p.pct).toBe(25)
    expect(p.perMonth).toBeNull()
  })

  it('con fecha pasada está vencida', () => {
    const p = goalProgress(100_000, '2026-09-01', [{ amount: 10_000, contributed_on: '2026-08-01' }], now)
    expect(p.state).toBe('overdue')
  })

  it('calcula el aporte mensual y detecta el atraso', () => {
    const p = goalProgress(120_000, '2027-01-13', [], now)
    expect(p.monthsLeft).toBe(3)
    expect(p.perMonth).toBe(40_000)
    expect(p.state).toBe('behind')
  })

  it('va en camino si el último mes aportó lo suficiente', () => {
    const p = goalProgress(120_000, '2027-01-13', [{ amount: 50_000, contributed_on: '2026-10-10' }], now)
    expect(p.state).toBe('ontrack')
  })
})

describe('goalSaved: una sola suma del aporte', () => {
  const contribs = [
    { goal_id: 'ojos', user_id: 'pareja', amount: 100_000, contributed_on: '2026-10-01' },
    { goal_id: 'auto', user_id: 'yo', amount: 50_000, contributed_on: '2026-10-02' },
  ]
  it('suma solo los aportes de esa meta, de quien sean', () => {
    expect(goalSaved(contribs, 'ojos')).toBe(100_000)
    expect(goalSaved(contribs, 'viaje')).toBe(0)
  })
  it('sin id suma la lista completa (la que ya viene filtrada)', () => {
    expect(goalSaved(contribs)).toBe(150_000)
  })
  it('goalProgress usa la misma suma: meta $970.000 con $100.000 -> 10 %', () => {
    const p = goalProgress(970_000, null, contribs.filter((c) => c.goal_id === 'ojos'), now)
    expect(p.saved).toBe(100_000)
    expect(p.pct).toBe(10)
    expect(p.remaining).toBe(870_000)
  })
})

describe('goalsOverview: el resumen y el detalle dicen lo mismo', () => {
  const goals = [
    { id: 'ojos', target_amount: 970_000 },
    { id: 'a', target_amount: 8_000_000 },
    { id: 'b', target_amount: 6_000_000 },
    { id: 'c', target_amount: 4_000_000 },
  ]
  const contribs = [{ goal_id: 'ojos', user_id: 'pareja', amount: 100_000 }]
  it('total ahorrado = suma del avance de cada meta ($100.000 de $18.970.000, 0 %)', () => {
    const o = goalsOverview(goals, contribs, 'yo')
    expect(o.saved).toBe(100_000)
    expect(o.target).toBe(18_970_000)
    expect(o.pct).toBe(0)
    expect(o.saved).toBe(goals.reduce((s, g) => s + goalSaved(contribs, g.id), 0))
  })
  it('lo aportado por la persona se cuenta aparte y puede ser $0 sin tocar el avance', () => {
    expect(goalsOverview(goals, contribs, 'yo').personSaved).toBe(0)
    expect(goalsOverview(goals, contribs, 'pareja').personSaved).toBe(100_000)
    expect(goalsOverview(goals, contribs, null).personSaved).toBe(100_000)
  })
})
