import { describe, expect, it } from 'vitest'
import { resolveScope, scopeContributions, scopeDebtShares, scopeDebts, scopeExpenses, scopeRecurring } from './scope'

const members = [{ user_id: 'a' }, { user_id: 'b' }]
const exp = (id: string, paid_by: string, shared: boolean, amount: number) => ({ id, paid_by, shared, amount }) as { id: string; paid_by: string; shared: boolean; amount: number }
const rec = (id: string, paid_by: string, shared = false, amount = 100_000) => ({ id, paid_by, shared, amount }) as never
const debt = (id: string, owner_id: string | null, original_amount = 1_000_000, monthly_payment = 100_000) => ({ id, owner_id, original_amount, monthly_payment }) as never
const con = (id: string, user_id: string) => ({ id, user_id }) as never

describe('De quién se ven los datos', () => {
  it('si la persona ya no está en el hogar vuelve al hogar', () => {
    expect(resolveScope('b', members)).toBe('b')
    expect(resolveScope('zzz', members)).toBe('all')
    expect(resolveScope('all', members)).toBe('all')
  })

  it('el hogar muestra el total de los dos', () => {
    const list = [exp('1', 'a', false, 100), exp('2', 'b', true, 200)]
    expect(scopeExpenses(list, 'all', 2)).toBe(list)
    expect(scopeRecurring([rec('1', 'a'), rec('2', 'b')], 'all', 2)).toHaveLength(2)
    expect(scopeDebts([debt('1', 'a'), debt('2', null)], 'all')).toHaveLength(2)
  })

  it('yo: lo personal mío y mi parte de lo compartido, aunque lo haya pagado mi pareja', () => {
    const list = [exp('1', 'a', false, 100), exp('2', 'b', false, 500), exp('3', 'b', true, 200), exp('4', 'a', true, 50)]
    const mine = scopeExpenses(list, 'a', 2)
    expect(mine.map((e) => [e.id, e.amount])).toEqual([['1', 100], ['3', 100], ['4', 25]])
    expect(mine.find((e) => e.id === '3')?.fullAmount).toBe(200)
    expect(mine.reduce((s, e) => s + e.amount, 0)).toBe(225)
  })

  it('mi pareja: lo suyo y su parte, según el reparto acordado', () => {
    const list = [exp('1', 'a', false, 100), exp('2', 'b', false, 500), exp('3', 'a', true, 1000)]
    const hers = scopeExpenses(list, 'b', { a: 0.7, b: 0.3 })
    expect(hers.map((e) => [e.id, e.amount])).toEqual([['2', 500], ['3', 300]])
  })

  it('lo de cada uno más lo del otro suma el total del hogar', () => {
    const list = [exp('1', 'a', false, 100), exp('2', 'b', false, 500), exp('3', 'b', true, 301)]
    const total = list.reduce((s, e) => s + e.amount, 0)
    const parts = ['a', 'b'].flatMap((w) => scopeExpenses(list, w, 2)).reduce((s, e) => s + e.amount, 0)
    expect(Math.abs(parts - total)).toBeLessThanOrEqual(1) // el redondeo de un peso
  })

  it('fijos: los de la persona y su parte de los compartidos', () => {
    const r = scopeRecurring([rec('1', 'a'), rec('2', 'b'), rec('3', 'b', true, 200_000)], 'a', 2)
    expect(r.map((x) => [x.id, x.amount])).toEqual([['3', 100_000], ['1', 100_000]].sort())
  })

  it('deudas: las de la persona y las de los dos, y de estas solo su parte', () => {
    const debts = [debt('1', 'a'), debt('2', 'b'), debt('3', null, 2_000_000, 200_000)]
    expect(scopeDebts(debts, 'a').map((d) => d.id)).toEqual(['1', '3'])
    const pays = [{ debt_id: '3', amount: 100_000 }, { debt_id: '2', amount: 5 }] as never
    const s = scopeDebtShares(debts, pays, 'a', { a: 0.6, b: 0.4 })
    expect(s.debts.map((d) => [d.id, d.original_amount, d.monthly_payment])).toEqual([['1', 1_000_000, 100_000], ['3', 1_200_000, 120_000]])
    expect(s.payments.map((p) => [p.debt_id, p.amount])).toEqual([['3', 60_000]])
  })

  it('los aportes son los de esa persona', () => {
    expect(scopeContributions([con('1', 'a'), con('2', 'b')], 'a').map((c) => c.id)).toEqual(['1'])
  })
})
