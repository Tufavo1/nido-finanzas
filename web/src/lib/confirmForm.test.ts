import { describe, expect, it } from 'vitest'
import { confirmBlocker } from './confirmForm'
import { kindForStatus } from './screenStatus'

const OK = { amount: 12_990, note: 'Almacen Demo', categoryId: 'c1', paidBy: 'u1' }

describe('confirmBlocker', () => {
  it('con todo completo se puede guardar', () => {
    expect(confirmBlocker(OK, ['u1', 'u2'])).toBeNull()
  })
  it('pide monto entero y mayor que cero', () => {
    expect(confirmBlocker({ ...OK, amount: 0 }, ['u1'])).toMatch(/cuánto/)
    expect(confirmBlocker({ ...OK, amount: 10.5 }, ['u1'])).toMatch(/cuánto/)
    expect(confirmBlocker({ ...OK, amount: -5 }, ['u1'])).toMatch(/cuánto/)
  })
  it('pide comercio, categoría y quién pagó', () => {
    expect(confirmBlocker({ ...OK, note: '  ' }, ['u1'])).toMatch(/dónde/)
    expect(confirmBlocker({ ...OK, categoryId: null }, ['u1'])).toMatch(/categoría/)
    expect(confirmBlocker({ ...OK, paidBy: 'otro' }, ['u1'])).toMatch(/pagó/)
  })
})

describe('kindForStatus', () => {
  it('traduce códigos de respuesta al tipo de error', () => {
    expect(kindForStatus(0)).toBe('OFFLINE')
    expect(kindForStatus(401)).toBe('UNAUTHORIZED')
    expect(kindForStatus(403)).toBe('FORBIDDEN')
    expect(kindForStatus(404)).toBe('NOT_FOUND')
    expect(kindForStatus(503)).toBe('MAINTENANCE')
    expect(kindForStatus(504)).toBe('TIMEOUT')
    expect(kindForStatus(500)).toBe('SERVER')
    expect(kindForStatus(418)).toBe('UNKNOWN')
  })
})
