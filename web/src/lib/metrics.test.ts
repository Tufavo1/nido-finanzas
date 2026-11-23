import { describe, expect, it, vi } from 'vitest'
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
  it('recordar los intentos guardados: recargar la página no reinicia el freno', () => {
    const mem = new Map<string, string>()
    const fake = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
    vi.stubGlobal('localStorage', fake)
    const a = createThrottle(2, 1000, 'k')
    a.fail()
    a.fail()
    expect(a.remaining()).toBeGreaterThan(0)
    // «recarga»: otra instancia con la misma clave sigue frenada
    expect(createThrottle(2, 1000, 'k').remaining()).toBeGreaterThan(0)
    a.reset()
    expect(createThrottle(2, 1000, 'k').remaining()).toBe(0)
    vi.unstubAllGlobals()
  })
})

import { analyzeSalary, monthsToPayoff, summarizeDebts } from './finance'

const debt = (o: Record<string, unknown> = {}) =>
  ({ id: 'd1', household_id: 'h', name: 'Tarjeta', kind: 'tarjeta', owner_id: null, original_amount: 100000, monthly_payment: 20000, monthly_rate: 0, due_day: null, archived: false, created_at: '', ...o }) as never
const pay = (amount: number, paid_on = '2026-10-02', debt_id = 'd1') =>
  ({ id: `${amount}${paid_on}`, household_id: 'h', debt_id, amount, paid_by: 'a', paid_on, created_at: '' }) as never

describe('deudas', () => {
  it('calcula meses para saldar con y sin interés', () => {
    expect(monthsToPayoff(100000, 20000, 0)).toBe(5)
    expect(monthsToPayoff(100000, 2000, 2)).toBeNull()
    expect(monthsToPayoff(100000, 10000, 2)).toBe(12)
    expect(monthsToPayoff(0, 0, 5)).toBe(0)
  })
  it('descuenta pagos y avisa si la cuota no cubre el interés', () => {
    const now = new Date(2026, 9, 15)
    const s = summarizeDebts([debt({ monthly_payment: 1000, monthly_rate: 3 })], [pay(10000)], now)
    expect(s.remaining).toBe(90000)
    expect(s.freeInMonths).toBeNull()
    expect(s.findings.some((f) => f.level === 'bad')).toBe(true)
  })
  it('sugiere atacar primero la de mayor interés', () => {
    const s = summarizeDebts(
      [debt({ id: 'a', name: 'Barata', monthly_rate: 1 }), debt({ id: 'b', name: 'Cara', monthly_rate: 4 })],
      [],
      new Date(2026, 9, 15),
    )
    expect(s.focus?.debt.name).toBe('Cara')
  })
})

describe('sueldo', () => {
  const month = new Date(2026, 9, 1)
  const now = new Date(2026, 9, 15)
  it('buen mes: queda ahorro', () => {
    const a = analyzeSalary({ income: 1000000, spent: 300000, commitments: 100000, month, now })
    expect(a.level).toBe('ok')
    expect(a.free).toBe(600000)
    expect(a.debtPct).toBe(10)
  })
  it('detecta que no le alcanza al ritmo actual', () => {
    const a = analyzeSalary({ income: 1000000, spent: 700000, commitments: 100000, month, now })
    expect(a.level).toBe('bad')
    expect(a.projectedFree!).toBeLessThan(0)
  })
  it('deudas sobre 40 % del sueldo es malo', () => {
    const a = analyzeSalary({ income: 1000000, spent: 100000, commitments: 450000, month, now })
    expect(a.level).toBe('bad')
  })
})

describe('reparto acordado (no mitad y mitad)', () => {
  const month = new Date(2026, 9, 1)
  const now = new Date(2026, 9, 15)
  const pair = (first: [string, number], second: [string, number]) =>
    [first, second].map(([user_id, share_pct]) => ({ user_id, share_pct, display_name: user_id, color: 'blue', household_id: 'h', joined_at: '' })) as never[]

  it('58 % y 42 % de $100 son exactamente $58 y $42, sin importar el orden de las personas', () => {
    const m = computeMetrics([exp(100, 'a', true)], [], [], pair(['b', 42], ['a', 58]), month, now)
    expect(m.people.find((p) => p.userId === 'a')?.fairShare).toBe(58)
    expect(m.people.find((p) => p.userId === 'b')?.fairShare).toBe(42)
  })

  it('las partes siempre suman el total compartido', () => {
    for (const total of [1, 99, 101, 12_345, 999_999]) {
      const m = computeMetrics([exp(total, 'a', true)], [], [], pair(['a', 33], ['b', 67]), month, now)
      expect(m.people[0]!.fairShare + m.people[1]!.fairShare, String(total)).toBe(total)
    }
  })

  it('el peso que sobra va a quien le faltaba más para completar su parte', () => {
    // 33 % de $101 = 33,33 y 67 % = 67,67: el peso suelto es de quien tiene 67 %
    const m = computeMetrics([exp(101, 'a', true)], [], [], pair(['a', 33], ['b', 67]), month, now)
    expect(m.people.map((p) => p.fairShare)).toEqual([33, 68])
  })
})
