import { describe, expect, it } from 'vitest'
import { goalProgress } from './goals'

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
