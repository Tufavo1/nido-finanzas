import { describe, expect, it } from 'vitest'
import { classifyEvent, detectAlerts, type SecurityEvent } from './securityEvents'

// Clasificación de eventos de seguridad y alertas con severidad. Puras, `now` explícito, ventana de 10 minutos.
const NOW = Date.UTC(2026, 10, 21, 15, 0, 0)
const MIN = 60_000

const failed = (userId: string, minsAgo: number, ip = '203.0.113.10'): SecurityEvent => ({ type: 'login_failed', userId, ip, at: NOW - minsAgo * MIN })
const many = (n: number, f: (i: number) => SecurityEvent) => Array.from({ length: n }, (_, i) => f(i))

describe('classifyEvent: severidad de un evento suelto', () => {
  it('inicio correcto = info; un fallo suelto = low', () => {
    expect(classifyEvent({ type: 'login_ok', at: NOW, userId: 'u1' }).severity).toBe('info')
    expect(classifyEvent({ type: 'login_failed', at: NOW, userId: 'u1' }).severity).toBe('low')
  })
  it('bloqueo por límite de intentos = medium; MFA fallido = medium', () => {
    expect(classifyEvent({ type: 'login_blocked', at: NOW, userId: 'u1' }).severity).toBe('medium')
    expect(classifyEvent({ type: 'mfa_failed', at: NOW, userId: 'u1' }).severity).toBe('medium')
  })
  it('dispositivo nuevo = medium; cambio de contraseña = medium; cuenta borrada = medium', () => {
    expect(classifyEvent({ type: 'new_device', at: NOW, userId: 'u1', deviceId: 'd9' }).severity).toBe('medium')
    expect(classifyEvent({ type: 'password_change', at: NOW, userId: 'u1' }).severity).toBe('medium')
    expect(classifyEvent({ type: 'account_deleted', at: NOW, userId: 'u1' }).severity).toBe('medium')
  })
  it('cambio de rol a administrador = high', () => {
    expect(classifyEvent({ type: 'role_change', at: NOW, userId: 'u1', meta: { to: 'admin' } }).severity).toBe('high')
  })
  it('solo devuelve campos seguros: nada de meta', () => {
    const c = classifyEvent({ type: 'login_failed', at: NOW, userId: 'u1', ip: '203.0.113.10', meta: { password: 'Secreto123!', rawText: 'Compra $12.990' } })
    expect(Object.keys(c).sort()).toEqual(['at', 'deviceId', 'ip', 'severity', 'type', 'userId'].filter((k) => k in c).sort())
    expect(JSON.stringify(c)).not.toMatch(/Secreto123|12\.990|password|rawText/)
  })
})

describe('detectAlerts: fuerza bruta', () => {
  it('5 fallos del mismo usuario en 10 minutos = alerta high', () => {
    const alerts = detectAlerts(many(5, (i) => failed('u1', i)), NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'brute_force', severity: 'high', subject: 'u1', count: 5 })
  })
  it('4 fallos no alcanzan', () => {
    expect(detectAlerts(many(4, (i) => failed('u1', i)), NOW)).toEqual([])
  })
  it('5 fallos repartidos en más de 10 minutos no alcanzan', () => {
    expect(detectAlerts([0, 3, 6, 9, 12].map((m) => failed('u1', m)), NOW)).toEqual([])
  })
  it('20 fallos o más suben a critical', () => {
    expect(detectAlerts(many(20, (i) => failed('u1', i * 0.4)), NOW)[0]).toMatchObject({ kind: 'brute_force', severity: 'critical' })
  })
  it('los fallos de usuarios distintos no se suman entre sí como fuerza bruta de un usuario', () => {
    const alerts = detectAlerts([...many(3, (i) => failed('u1', i, '198.51.100.1')), ...many(3, (i) => failed('u2', i, '198.51.100.2'))], NOW)
    expect(alerts.find((a) => a.kind === 'brute_force')).toBeUndefined()
  })
})

describe('detectAlerts: relleno de credenciales', () => {
  it('muchas cuentas distintas fallando desde la misma IP = alerta high con la IP como sujeto', () => {
    const ev = many(10, (i) => failed(`u${i}`, i * 0.5, '198.51.100.7'))
    const a = detectAlerts(ev, NOW).find((x) => x.kind === 'credential_stuffing')
    expect(a).toMatchObject({ severity: 'high', subject: '198.51.100.7', count: 10 })
  })
  it('pocas cuentas desde la misma IP no alcanzan', () => {
    expect(detectAlerts(many(3, (i) => failed(`u${i}`, i, '198.51.100.7')), NOW).find((x) => x.kind === 'credential_stuffing')).toBeUndefined()
  })
})

describe('detectAlerts: dispositivo nuevo, MFA y escalada', () => {
  it('dispositivo nuevo genera alerta medium para avisar a la persona', () => {
    const a = detectAlerts([{ type: 'new_device', at: NOW - MIN, userId: 'u1', deviceId: 'd9' }], NOW)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ kind: 'new_device', severity: 'medium', subject: 'u1' })
  })
  it('3 fallos de MFA seguidos del mismo usuario = alerta high', () => {
    const ev = many(3, (i): SecurityEvent => ({ type: 'mfa_failed', userId: 'u1', at: NOW - i * MIN }))
    expect(detectAlerts(ev, NOW)[0]).toMatchObject({ kind: 'mfa_repeated_failure', severity: 'high', subject: 'u1', count: 3 })
  })
  it('2 fallos de MFA no alcanzan', () => {
    expect(detectAlerts(many(2, (i): SecurityEvent => ({ type: 'mfa_failed', userId: 'u1', at: NOW - i * MIN })), NOW)).toEqual([])
  })
  it('un cambio de rol a administrador hecho por alguien que no es administrador = critical', () => {
    const a = detectAlerts([{ type: 'role_change', at: NOW - MIN, userId: 'u2', meta: { to: 'admin', actorIsAdmin: false } }], NOW)
    expect(a[0]).toMatchObject({ kind: 'privilege_escalation', severity: 'critical', subject: 'u2' })
  })
  it('el mismo cambio hecho por un administrador es high, no critical', () => {
    const a = detectAlerts([{ type: 'role_change', at: NOW - MIN, userId: 'u2', meta: { to: 'admin', actorIsAdmin: true } }], NOW)
    expect(a[0]).toMatchObject({ kind: 'privilege_escalation', severity: 'high' })
  })
  it('sin eventos no hay alertas; los eventos futuros o muy antiguos se ignoran', () => {
    expect(detectAlerts([], NOW)).toEqual([])
    expect(detectAlerts(many(6, (i) => failed('u1', 120 + i)), NOW)).toEqual([])
    expect(detectAlerts(many(6, (i) => failed('u1', -60 - i)), NOW)).toEqual([])
  })
})

describe('privacidad: ninguna alerta incluye contraseñas ni texto sensible', () => {
  it('descarta password, token y texto del aviso aunque vengan en meta', () => {
    const ev: SecurityEvent[] = many(6, (i) => ({
      type: 'login_failed',
      userId: 'u1',
      ip: '203.0.113.10',
      at: NOW - i * MIN,
      meta: { password: 'Secreto123!', token: 'eyJhbGciOi.demo.firma', rawText: 'Compra aprobada por $12.990 en ALMACEN DEMO SPA', email: 'persona@ejemplo.test' },
    }))
    ev.push({ type: 'new_device', userId: 'u1', at: NOW - MIN, deviceId: 'd9', meta: { password: 'Secreto123!', rawText: 'Compra $12.990' } })
    const out = JSON.stringify([...detectAlerts(ev, NOW), ...ev.map(classifyEvent)])
    expect(out).not.toMatch(/Secreto123|eyJhbGci|12\.990|ALMACEN|persona@ejemplo|password|token|rawText/i)
  })
})
