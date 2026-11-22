// Copyright (c) 2026 Dinovance
import { describe, expect, it, vi } from 'vitest'
import { googleErrorCode, googleErrorMessage, googleSignInAvailable, runNativeGoogleSignIn, type GoogleDeps } from './nativeGoogle'

const NONCE = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123_-'
const deps = (o: Partial<GoogleDeps> = {}): GoogleDeps & { calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    clientId: 'cliente-web.apps.googleusercontent.com',
    isSupported: async () => true,
    makeNonce: () => NONCE,
    requestIdToken: async (n, id) => (calls.push(`plugin:${n}:${id}`), 'ID.TOKEN.X'),
    exchange: async (t, n) => (calls.push(`supabase:${t}:${n}`), null),
    ...o,
  }
}

describe('inicio de sesión nativo con Google (Credential Manager)', () => {
  it('pasa el nonce en claro al selector (que lo hashea) y a Supabase, con el mismo token', async () => {
    const d = deps()
    expect(await runNativeGoogleSignIn(d)).toBeNull()
    expect(d.calls).toEqual([`plugin:${NONCE}:cliente-web.apps.googleusercontent.com`, `supabase:ID.TOKEN.X:${NONCE}`])
  })

  it.each([
    ['CANCELLED', 'Cancelaste el inicio de sesión con Google.'],
    ['NO_ACCOUNTS', 'No encontramos una cuenta de Google en este teléfono. Agrega una en Ajustes o usa tu correo y contraseña.'],
    ['NETWORK', 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'],
    ['INVALID_NONCE', 'No pudimos asegurar el inicio de sesión. Inténtalo de nuevo.'],
    ['UNSUPPORTED', 'Este teléfono no permite entrar con Google. Usa tu correo y contraseña.'],
  ])('el error %s del plugin da un mensaje simple', async (code, msg) => {
    const d = deps({ requestIdToken: async () => Promise.reject(Object.assign(new Error('x'), { code })) })
    expect(await runNativeGoogleSignIn(d)).toBe(msg)
    expect(googleErrorMessage(googleErrorCode({ code }))).toBe(msg)
  })

  it('un error desconocido o sin código es FAILED, sin filtrar su texto', async () => {
    const d = deps({ requestIdToken: async () => Promise.reject(new Error('token eyJabc correo@x.cl')) })
    const msg = await runNativeGoogleSignIn(d)
    expect(msg).toBe(googleErrorMessage('FAILED'))
    expect(msg).not.toMatch(/eyJ|@/)
  })

  it('si el servidor rechaza el token, mensaje propio (el plugin ya entregó el token)', async () => {
    const d = deps({ exchange: async () => 'No pudimos entrar con Google. Vuelve a intentarlo o usa tu correo y contraseña.' })
    expect(await runNativeGoogleSignIn(d)).toBe(googleErrorMessage('SERVER_REJECTED'))
  })

  it('el aviso del captcha (robot) pasa tal cual', async () => {
    const d = deps({ exchange: async () => 'No pudimos verificar que no eres un robot. Inténtalo de nuevo.' })
    expect(await runNativeGoogleSignIn(d)).toMatch(/robot/)
  })

  it('sin ID de cliente o sin soporte del plugin no se llama a nada', async () => {
    const a = deps({ clientId: undefined })
    expect(await runNativeGoogleSignIn(a)).toBe(googleErrorMessage('UNSUPPORTED'))
    const b = deps({ isSupported: async () => false })
    expect(await runNativeGoogleSignIn(b)).toBe(googleErrorMessage('UNSUPPORTED'))
    expect(a.calls.concat(b.calls)).toEqual([])
  })

  it('un token vacío se trata como fallo', async () => {
    expect(await runNativeGoogleSignIn(deps({ requestIdToken: async () => '' }))).toBe(googleErrorMessage('FAILED'))
  })

  it('el botón solo aparece con ID de cliente Y soporte del plugin', async () => {
    expect(await googleSignInAvailable({ clientId: 'x', isSupported: async () => true })).toBe(true)
    expect(await googleSignInAvailable({ clientId: undefined, isSupported: async () => true })).toBe(false)
    expect(await googleSignInAvailable({ clientId: 'x', isSupported: async () => false })).toBe(false)
    expect(await googleSignInAvailable({ clientId: 'x', isSupported: async () => Promise.reject(new Error('no plugin')) })).toBe(false)
  })

  it('no escribe en la consola', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await runNativeGoogleSignIn(deps({ requestIdToken: async () => Promise.reject(new Error('boom')) }))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
