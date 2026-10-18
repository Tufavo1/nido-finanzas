import { describe, expect, it } from 'vitest'
import { computeMetrics } from './metrics'
import { compact, monthGrid } from './calendar'
import { createThrottle, passwordStrength } from './security'

const members = [
  { user_id: 'a', display_name: 'Ana', color: 'blue', household_id: 'h', joined_at: '' },
  { user_id: 'b', display_name: 'Beto', color: 'amber', household_id: 'h', joined_at: '' },
] as never[]
const cat = (id: string, budget: number) => ({ id, name: id, monthly_budget: budget }) as never
const exp = (amount: number, paid_by: string, shared: boolean, spent_on = '2026-10-05', category_id = 'c1') =>
  ({ id: `${amount}${paid_by}${spent_on}`, amount, paid_by, shared, spent_on, category_id, note: null }) as never

describe('computeMetrics', () => {
  const month = new Date(2026, 9, 1)
  const now = new Date(2026, 9, 15)

  it('reparte lo compartido en partes exactas y calcula quién debe', () => {
    const m = computeMetrics([exp(10001, 'a', true), exp(500, 'b', false)], [], [cat('c1', 0)], members, month, now)
    expect(m.people[0]!.fairShare + m.people[1]!.fairShare).toBe(10001)
    expect(m.settle?.from.userId).toBe('b')
    expect(m.personal).toBe(500)
  })

  it('sin gastos compartidos no hay deuda', () => {
    const m = computeMetrics([exp(100, 'a', false)], [], [], members, month, now)
    expect(m.settle).toBeNull()
  })

  it('proyecta y compara con el mes anterior a la misma fecha', () => {
    const prev = [exp(1000, 'a', true, '2026-09-10'), exp(9000, 'a', true, '2026-09-28')]
    const m = computeMetrics([exp(3000, 'a', true)], prev, [], members, month, now)
    expect(m.projection).toBe(6200)
    expect(m.prevTotal).toBe(1000)
    expect(m.deltaPct).toBe(200)
  })

  it('detecta el ritmo del presupuesto', () => {
    expect(computeMetrics([exp(1200, 'a', true)], [], [cat('c1', 1000)], members, month, now).pace).toBe('pasado')
    expect(computeMetrics([exp(100, 'a', true)], [], [cat('c1', 1000)], members, month, now).pace).toBe('bien')
    expect(computeMetrics([exp(100, 'a', true)], [], [cat('c1', 0)], members, month, now).pace).toBe('sin-presupuesto')
  })
})

describe('calendario', () => {
  it('octubre 2026 empieza en jueves', () => {
    const g = monthGrid(2026, 9)
    expect(g.indexOf(1)).toBe(3)
    expect(g.length % 7).toBe(0)
    expect(g.filter(Boolean)).toHaveLength(31)
  })
  it('abrevia montos', () => {
    expect(compact(48900)).toBe('49k')
    expect(compact(1250000)).toBe('1,3M')
    expect(compact(800)).toBe('800')
  })
})

describe('seguridad', () => {
  it('califica contraseñas', () => {
    expect(passwordStrength('')).toBe(0)
    expect(passwordStrength('corta')).toBe(1)
    expect(passwordStrength('1234567890')).toBe(1)
    expect(passwordStrength('unaclavelarga')).toBe(2)
    expect(passwordStrength('Una-Clave-Larga-9')).toBe(4)
  })
  it('frena tras varios intentos fallidos', () => {
    const t = createThrottle(3, 1000)
    t.fail()
    t.fail()
    expect(t.remaining()).toBe(0)
    t.fail()
    expect(t.remaining()).toBeGreaterThan(0)
    t.reset()
    expect(t.remaining()).toBe(0)
  })
})
