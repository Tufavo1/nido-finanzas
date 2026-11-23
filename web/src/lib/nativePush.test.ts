// Copyright (c) 2026 Dinovance
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Cb = (e: { value?: string }) => void
const h = vi.hoisted(() => ({
  perm: 'granted' as string,
  token: 'tok-1' as string | undefined,
  regError: false,
  silent: false,
  listeners: new Map<string, Cb>(),
  removed: 0,
  insert: vi.fn(),
  del: vi.fn(),
  eq: vi.fn(),
  unregister: vi.fn(async () => undefined),
  removeAll: vi.fn(async () => undefined),
  session: { user: { id: 'u1' } } as { user: { id: string } } | null,
}))

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: async () => ({ receive: h.perm }),
    requestPermissions: async () => ({ receive: h.perm }),
    addListener: async (name: string, cb: Cb) => {
      h.listeners.set(name, cb)
      return { remove: async () => void h.removed++ }
    },
    register: async () => {
      if (h.silent) return
      if (h.regError) h.listeners.get('registrationError')?.({})
      else h.listeners.get('registration')?.({ value: h.token })
    },
    unregister: h.unregister,
    removeAllListeners: h.removeAll,
  },
}))
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: h.session } }) }, from: () => ({ insert: h.insert, delete: () => ({ eq: h.eq }) }) },
}))

import { classifyDbError, disablePush, enablePush, getPushStatus, PushError, pushErrorCopy, refreshPushToken } from './nativePush'

const code = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => (e instanceof PushError ? e.code : 'other')))

const store = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })

beforeEach(() => {
  store.clear()
  Object.assign(h, { perm: 'granted', token: 'tok-1', regError: false, silent: false, session: { user: { id: 'u1' } } })
  h.listeners.clear()
  h.removed = 0
  h.insert.mockReset().mockResolvedValue({ error: null, status: 201 })
  h.eq.mockReset().mockResolvedValue({ error: null, status: 204 })
  h.unregister.mockClear()
  h.removeAll.mockClear()
})

describe('nativePush', () => {
  it('permiso denegado: DENIED y no pide token ni escribe', async () => {
    h.perm = 'denied'
    expect(await code(enablePush())).toBe('DENIED')
    expect(h.insert).not.toHaveBeenCalled()
  })
  it('token ok: inserta {token, platform android}, limpia escuchas y queda registrado', async () => {
    expect(await enablePush()).toEqual({ permission: 'granted', tokenRegistered: true })
    expect(h.insert).toHaveBeenCalledWith({ token: 'tok-1', platform: 'android' })
    expect(h.removed).toBe(2)
    expect(await getPushStatus()).toEqual({ permission: 'granted', tokenRegistered: true })
  })
  it('23505 (el token ya existía) cuenta como éxito', async () => {
    h.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' }, status: 409 })
    await expect(enablePush()).resolves.toMatchObject({ tokenRegistered: true })
  })
  it('tabla ausente: UNAVAILABLE (42P01, PGRST o 404)', async () => {
    for (const r of [{ error: { code: '42P01', message: 'relation does not exist' } }, { error: { code: 'PGRST205', message: 'x' } }, { error: { message: 'Not Found' }, status: 404 }]) {
      h.insert.mockResolvedValue(r)
      expect(await code(enablePush())).toBe('UNAVAILABLE')
    }
    expect(pushErrorCopy(new PushError('UNAVAILABLE'))).toContain('aún no están activados en el servidor')
  })
  it('sin conexión: OFFLINE y mensaje «Revisa tu conexión»', async () => {
    h.insert.mockResolvedValue({ error: { message: 'Failed to fetch' }, status: 0 })
    expect(await code(enablePush())).toBe('OFFLINE')
    expect(pushErrorCopy(new PushError('OFFLINE'))).toContain('Revisa tu conexión')
    h.insert.mockRejectedValue(new TypeError('x'))
    expect(await code(enablePush())).toBe('OFFLINE')
  })
  it('otro error: FAILED y mensaje general (null)', async () => {
    h.insert.mockResolvedValue({ error: { code: '42501', message: 'rls' }, status: 403 })
    expect(await code(enablePush())).toBe('FAILED')
    expect(pushErrorCopy(new PushError('FAILED'))).toBeNull()
  })
  it('registrationError: REGISTRATION', async () => {
    h.regError = true
    expect(await code(enablePush())).toBe('REGISTRATION')
    expect(h.removed).toBe(2)
  })
  it('timeout: TIMEOUT y se limpian las escuchas', async () => {
    h.silent = true
    expect(await code(enablePush(20))).toBe('TIMEOUT')
    expect(h.removed).toBe(2)
  })
  it('disable borra la fila por token y apaga el registro', async () => {
    await enablePush()
    await disablePush()
    expect(h.eq).toHaveBeenCalledWith('token', 'tok-1')
    expect(h.unregister).toHaveBeenCalled()
    expect(h.removeAll).toHaveBeenCalled()
    expect((await getPushStatus()).tokenRegistered).toBe(false)
  })
  it('disable: si no se pudo borrar la fila, lanza y sigue encendido', async () => {
    await enablePush()
    h.eq.mockResolvedValue({ error: { message: 'Failed to fetch' }, status: 0 })
    expect(await code(disablePush())).toBe('OFFLINE')
    expect((await getPushStatus()).tokenRegistered).toBe(true)
  })
  it('permiso prompt se ve como default', async () => {
    h.perm = 'prompt'
    expect(await getPushStatus()).toEqual({ permission: 'default', tokenRegistered: false })
  })
  it('al abrir: permiso concedido pero nunca activado NO se registra solo', async () => {
    expect(await refreshPushToken()).toBe(false)
    expect(h.insert).not.toHaveBeenCalled()
  })
  it('al abrir: si estaba activado y el token rotó, guarda el nuevo y borra el viejo', async () => {
    await enablePush()
    h.insert.mockClear()
    h.token = 'tok-2'
    expect(await refreshPushToken()).toBe(true)
    expect(h.insert).toHaveBeenCalledWith({ token: 'tok-2', platform: 'android' })
    expect(h.eq).toHaveBeenCalledWith('token', 'tok-1')
  })
  it('al abrir: mismo token no escribe; permiso revocado no registra', async () => {
    await enablePush()
    h.insert.mockClear()
    expect(await refreshPushToken()).toBe(false)
    h.perm = 'denied'
    expect(await refreshPushToken()).toBe(false)
    expect(h.insert).not.toHaveBeenCalled()
  })
  it('classifyDbError', () => {
    expect(classifyDbError(null)).toBe('OK')
  })
})
