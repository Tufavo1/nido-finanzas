/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSecureStorage, type SecureBackend } from './secureSession'

// DEC-03: la sesión vive en el almacén seguro (Keystore), no en localStorage.

function memoryBackend() {
  const data = new Map<string, string>()
  const backend: SecureBackend = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  }
  return { data, backend }
}

describe('createSecureStorage (auth.storage de supabase-js)', () => {
  it('guarda y lee por el respaldo inyectado', async () => {
    const { data, backend } = memoryBackend()
    const s = createSecureStorage(backend)
    await s.setItem('contigo-auth', '{"access_token":"demo"}')
    expect(data.get('contigo-auth')).toBe('{"access_token":"demo"}')
    expect(await s.getItem('contigo-auth')).toBe('{"access_token":"demo"}')
  })

  it('una clave que no existe devuelve null', async () => {
    expect(await createSecureStorage(memoryBackend().backend).getItem('nada')).toBeNull()
  })

  it('removeItem borra la sesión', async () => {
    const { data, backend } = memoryBackend()
    const s = createSecureStorage(backend)
    await s.setItem('contigo-auth', 'x')
    await s.removeItem('contigo-auth')
    expect(await s.getItem('contigo-auth')).toBeNull()
    expect(data.size).toBe(0)
  })

  it('sobrescribe el valor anterior', async () => {
    const s = createSecureStorage(memoryBackend().backend)
    await s.setItem('k', 'uno')
    await s.setItem('k', 'dos')
    expect(await s.getItem('k')).toBe('dos')
  })

  it('si el almacén seguro falla al guardar, el error se propaga (no se pierde la sesión en silencio)', async () => {
    const s = createSecureStorage({
      get: async () => null,
      set: async () => {
        throw new Error('keystore no disponible')
      },
      remove: async () => {},
    })
    await expect(s.setItem('k', 'v')).rejects.toThrow(/keystore/)
  })

  it('si el almacén seguro falla al leer, devuelve null (se pedirá iniciar sesión)', async () => {
    const s = createSecureStorage({
      get: async () => {
        throw new Error('keystore no disponible')
      },
      set: async () => {},
      remove: async () => {},
    })
    expect(await s.getItem('k')).toBeNull()
  })

  it('el módulo no usa localStorage ni sessionStorage', () => {
    const src = readFileSync(new URL('./secureSession.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/localStorage|sessionStorage/)
  })
})
