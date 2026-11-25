import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
const flags = vi.hoisted(() => ({ native: true, nativeFails: false }))
vi.mock('./nativeBridge', () => ({ isNativeApp: () => flags.native }))
vi.mock('./nativePush', () => ({
  disablePush: async () => {
    calls.push('nativo')
    if (flags.nativeFails) throw new Error('sin red')
  },
}))
vi.mock('./push', () => ({ disablePush: async () => void calls.push('web') }))
vi.mock('./supabase', () => ({ supabase: { auth: { signOut: async () => void calls.push('signOut') } } }))

import { signOutClean } from './signOut'

beforeEach(() => {
  calls.length = 0
  flags.native = true
  flags.nativeFails = false
})

describe('M1 cerrar sesión borra primero la fila de avisos del servidor', () => {
  it('en la app nativa borra el token y después cierra sesión', async () => {
    await signOutClean()
    expect(calls).toEqual(['nativo', 'signOut'])
  })
  it('en la web borra la suscripción web y después cierra sesión', async () => {
    flags.native = false
    await signOutClean()
    expect(calls).toEqual(['web', 'signOut'])
  })
  it('si el borrado falla (sin red) igual cierra sesión', async () => {
    flags.nativeFails = true
    await signOutClean()
    expect(calls).toEqual(['nativo', 'signOut'])
  })
})
