import { describe, expect, it } from 'vitest'
import { HOUR_OPTIONS, PANEL_LIMIT_NOTICE, hoursLabel, overallHealth, parseOverview, sortBySeverity } from './securityPanel'

const GOOD = {
  generated_at: '2026-11-21T12:00:00Z',
  counters: { login_failed_blocked: 3, mfa_failed: 1, new_device: 0, recoveries: 2, extra: 'no-es-numero' },
  alerts: [{ id: 'a1', severity: 'high', kind: 'brute_force', title: 'Muchos intentos', detail: 'x', at: '2026-11-21T11:00:00Z' }, { id: 'mala', severity: 'rara' }],
  events: [{ id: 'e1', at: '2026-11-21T11:30:00Z', kind: 'new_device', severity: 'medium', actor_hint: 'u-***', detail: 'Android' }],
  health: { db: 'ok', auth: 'degraded', gateway: 'ok', push_queue: 'ok' },
}

describe('parseOverview', () => {
  it('acepta la forma esperada y descarta filas inválidas y contadores no numéricos', () => {
    const o = parseOverview(GOOD)!
    expect(o.alerts.map((a) => a.id)).toEqual(['a1'])
    expect(o.events).toHaveLength(1)
    expect(o.counters).toEqual({ login_failed_blocked: 3, mfa_failed: 1, new_device: 0, recoveries: 2 })
  })
  it('un estado de salud desconocido o ausente cuenta como caído', () => {
    const o = parseOverview({ ...GOOD, health: { db: 'ok', auth: 'raro' } })!
    expect(o.health).toEqual({ db: 'ok', auth: 'down', gateway: 'down', push_queue: 'down' })
  })
  it('sin la forma mínima devuelve null', () => {
    expect(parseOverview(null)).toBeNull()
    expect(parseOverview({})).toBeNull()
    expect(parseOverview([])).toBeNull()
  })
})

describe('presentación', () => {
  it('ordena de más grave a menos grave y, a igual gravedad, lo más reciente primero, sin tocar el original', () => {
    const rows = [
      { id: 'a', severity: 'low' as const, at: '2026-11-21T10:00:00Z' },
      { id: 'b', severity: 'critical' as const, at: '2026-11-21T08:00:00Z' },
      { id: 'c', severity: 'low' as const, at: '2026-11-21T11:00:00Z' },
    ]
    expect(sortBySeverity(rows).map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('el peor estado de salud manda', () => {
    expect(overallHealth({ db: 'ok', auth: 'ok', gateway: 'ok', push_queue: 'ok' })).toBe('ok')
    expect(overallHealth({ db: 'ok', auth: 'degraded', gateway: 'ok', push_queue: 'ok' })).toBe('degraded')
    expect(overallHealth({ db: 'down', auth: 'degraded', gateway: 'ok', push_queue: 'ok' })).toBe('down')
  })
  it('las horas se leen en español', () => {
    expect(HOUR_OPTIONS.map(hoursLabel)).toEqual(['1 hora', '6 horas', '1 día', '3 días', '7 días'])
  })
  it('el aviso de límites habla de indicios y de que no garantiza detectar todo', () => {
    expect(PANEL_LIMIT_NOTICE).toMatch(/INDICIOS/)
    expect(PANEL_LIMIT_NOTICE).toMatch(/no garantiza/i)
  })
})
