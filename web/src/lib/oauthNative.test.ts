// Copyright (c) 2026 Dinovance
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./nativeBridge', async (orig) => ({ ...(await orig<typeof import('./nativeBridge')>()), isNativeApp: () => true }))
vi.mock('./supabase', () => ({ supabase: {}, PLACEHOLDER_KEY: 'k', PROXY_PREFIX: '/supabase' }))
const native = vi.fn(async () => null)
vi.mock('./nativeGoogle', () => ({ signInWithGoogleNative: () => native() }))

describe('Google en la app nativa nunca abre el flujo OAuth web', () => {
  it('signInWithGoogle delega en el selector nativo', async () => {
    const { signInWithGoogle } = await import('./oauth')
    expect(await signInWithGoogle()).toBeNull()
    expect(native).toHaveBeenCalledTimes(1)
  })
  it('el botón web de Google (GSI) no se carga en nativo', async () => {
    const { loadGsi } = await import('./google')
    await expect(loadGsi()).rejects.toThrow()
  })
  it('el código protege la salida a OAuth antes de llamar a signInWithOAuth', () => {
    const s = readFileSync(new URL('./oauth.ts', import.meta.url), 'utf8')
    expect(s.indexOf('if (isNativeApp()) return signInWithGoogleNative()')).toBeGreaterThan(-1)
    expect(s.indexOf('if (isNativeApp()) return signInWithGoogleNative()')).toBeLessThan(s.indexOf('signInWithOAuth({'))
  })
})
