import { describe, expect, it } from 'vitest'
import { analyzeSalary } from './finance'
import type { Recurring } from './data'
import { pendingFixedThisMonth } from './upcoming'

const rec = (over: Partial<Recurring>): Recurring =>
  ({ id: 'r1', active: true, amount: 300_000, shared: false, paid_by: 'me', day_of_month: 28, starts_on: '2026-01-01', last_applied: '2026-09-01', note: 'Arriendo', ...over }) as Recurring

const now = new Date(2026, 9, 10)

describe('fijos que aún vencen', () => {
  it('cuenta el que vence más adelante este mes', () => expect(pendingFixedThisMonth([rec({})], 'me', 2, now)).toBe(300_000))
  it('no cuenta el que ya se anotó este mes', () => expect(pendingFixedThisMonth([rec({ last_applied: '2026-10-01' })], 'me', 2, now)).toBe(0))
  it('divide los compartidos y ignora los de la pareja', () => {
    expect(pendingFixedThisMonth([rec({ shared: true })], 'me', 2, now)).toBe(150_000)
    expect(pendingFixedThisMonth([rec({ paid_by: 'otro' })], 'me', 2, now)).toBe(0)
  })
})

describe('sueldo con fijos pendientes', () => {
  const base = { income: 1_000_000, spent: 200_000, commitments: 0, month: now, now }
  it('el ritmo diario ya descuenta los fijos que faltan', () => {
    const sin = analyzeSalary(base)
    const con = analyzeSalary({ ...base, pendingFixed: 300_000 })
    expect(con.free).toBe(sin.free)
    expect(con.realFree).toBe(500_000)
    expect(con.safeDaily).toBeLessThan(sin.safeDaily!)
  })
  it('avisa cuando lo que queda no cubre los fijos', () => {
    const a = analyzeSalary({ ...base, spent: 800_000, pendingFixed: 300_000 })
    expect(a.realFree).toBe(-100_000)
    expect(a.level).toBe('bad')
    expect(a.safeDaily).toBe(0)
  })
  it('en un mes pasado no hay fijos pendientes', () => {
    expect(analyzeSalary({ ...base, month: new Date(2026, 8, 1), pendingFixed: 300_000 }).realFree).toBe(800_000)
  })
})
