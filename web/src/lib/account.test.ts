import { describe, expect, it } from 'vitest'
import { hasPassword, usesGoogle } from './account'

const u = (app: Record<string, unknown>, meta: Record<string, unknown> = {}) => ({ app_metadata: app, user_metadata: meta })

describe('hasPassword', () => {
  it('cuenta con correo', () => expect(hasPassword(u({ providers: ['email'] }))).toBe(true))
  it('cuenta antigua con provider', () => expect(hasPassword(u({ provider: 'email' }))).toBe(true))
  it('solo Google no tiene', () => expect(hasPassword(u({ provider: 'google', providers: ['google'] }))).toBe(false))
  it('Google que creó contraseña', () => expect(hasPassword(u({ providers: ['google'] }, { has_password: true }))).toBe(true))
  it('sin usuario', () => expect(hasPassword(null)).toBe(false))
})
describe('usesGoogle', () => {
  it('detecta Google', () => expect(usesGoogle(u({ providers: ['email', 'google'] }))).toBe(true))
  it('correo solo', () => expect(usesGoogle(u({ providers: ['email'] }))).toBe(false))
})
