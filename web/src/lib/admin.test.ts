import { describe, expect, it } from 'vitest'
import { adminNotes, adminRates } from './admin'
import type { AdminStats } from './admin'

const base: AdminStats = {
  generated_at: '2026-10-26T10:00:00Z',
  db_bytes: 20 * 1024 * 1024,
  users: { total: 10, confirmed: 10, new_7d: 1, new_30d: 3, active_1d: 2, active_7d: 6, active_30d: 8 },
  households: { total: 5, couples: 4, solo: 1 },
  usage: { expenses_total: 100, expenses_7d: 20, expenses_30d: 60, users_with_expense_7d: 4 },
  features: [],
  daily: [],
}
const mk = (p: Partial<AdminStats>): AdminStats => ({ ...base, ...p })

describe('Panel de administración', () => {
  it('calcula porcentajes sin dividir por cero', () => {
    expect(adminRates(base)).toEqual({ stay: 80, usesIt: 67, couples: 80, confirmed: 100 })
    expect(adminRates(mk({ users: { ...base.users, total: 0, active_7d: 0 }, households: { total: 0, couples: 0, solo: 0 } })).stay).toBe(0)
  })
  it('sin problemas dice que todo está en orden', () => {
    const n = adminNotes(base)
    expect(n).toHaveLength(1)
    expect(n[0].level).toBe('ok')
  })
  it('avisa del espacio y lo pone primero', () => {
    const n = adminNotes(mk({ db_bytes: 450 * 1024 * 1024, users: { ...base.users, confirmed: 2 } }))
    expect(n[0].level).toBe('bad')
    expect(n.map((x) => x.title).join()).toContain('correo')
  })
  it('detecta que entran pero no anotan gastos', () => {
    expect(adminNotes(mk({ usage: { ...base.usage, users_with_expense_7d: 0 } }))[0].title).toContain('nadie anota')
  })
})
