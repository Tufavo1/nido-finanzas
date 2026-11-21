import { describe, expect, it } from 'vitest'
import { createNativeFetch, resolveApiBase, WEB_API_BASE, type NativeRequest, type NativeResponse } from './nativeApi'

// DEC-01: la app nativa pasa por el Worker /supabase/* con HTTP nativo (sin cabecera Origin).

describe('resolveApiBase (VITE_API_BASE)', () => {
  it('vacío o ausente usa /supabase, como en la web', () => {
    expect(WEB_API_BASE).toBe('/supabase')
    expect(resolveApiBase('')).toBe('/supabase')
    expect(resolveApiBase(undefined)).toBe('/supabase')
    expect(resolveApiBase('   ')).toBe('/supabase')
  })

  it('con valor usa esa URL', () => {
    expect(resolveApiBase('https://api.ejemplo.test/supabase')).toBe('https://api.ejemplo.test/supabase')
  })

  it('quita la barra final', () => {
    expect(resolveApiBase('https://api.ejemplo.test/supabase/')).toBe('https://api.ejemplo.test/supabase')
  })

  it('en producción exige https (S-07)', () => {
    expect(resolveApiBase('https://api.ejemplo.test/supabase', true)).toBe('https://api.ejemplo.test/supabase')
    expect(() => resolveApiBase('http://api.ejemplo.test/supabase', true)).toThrow()
    expect(resolveApiBase('http://localhost:8080/supabase', false)).toBe('http://localhost:8080/supabase')
  })

  it('rechaza esquemas que no son http(s)', () => {
    expect(() => resolveApiBase('javascript:alert(1)')).toThrow()
    expect(() => resolveApiBase('file:///etc/passwd')).toThrow()
    expect(() => resolveApiBase('ftp://x.test/supabase')).toThrow()
  })
})

function fakeTransport(res: Partial<NativeResponse> = {}) {
  const calls: NativeRequest[] = []
  const transport = async (req: NativeRequest): Promise<NativeResponse> => {
    calls.push(req)
    return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}', ...res }
  }
  return { calls, transport }
}

describe('createNativeFetch', () => {
  it('envía la petición por el transporte con método, URL y cuerpo, y entrega una Response', async () => {
    const { calls, transport } = fakeTransport({ status: 201, body: '{"id":"x"}' })
    const f = createNativeFetch(transport)
    const res = await f('https://api.ejemplo.test/supabase/rest/v1/expenses', {
      method: 'POST',
      headers: { apikey: 'sb_publishable_demo', 'content-type': 'application/json' },
      body: '{"amount":4500}',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ url: 'https://api.ejemplo.test/supabase/rest/v1/expenses', method: 'POST', body: '{"amount":4500}' })
    expect(calls[0]!.headers['apikey']).toBe('sb_publishable_demo')
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'x' })
  })

  it('nunca añade la cabecera Origin', async () => {
    const { calls, transport } = fakeTransport()
    await createNativeFetch(transport)('https://api.ejemplo.test/supabase/auth/v1/token', { method: 'POST', body: '{}' })
    expect(Object.keys(calls[0]!.headers).map((k) => k.toLowerCase())).not.toContain('origin')
  })

  it('si alguien la pone (Headers, objeto o pares), la quita', async () => {
    const { calls, transport } = fakeTransport()
    const f = createNativeFetch(transport)
    await f('https://api.ejemplo.test/supabase/rest/v1/expenses', { headers: new Headers({ Origin: 'https://otro.test', apikey: 'k' }) })
    await f('https://api.ejemplo.test/supabase/rest/v1/expenses', { headers: { ORIGIN: 'https://otro.test' } })
    await f('https://api.ejemplo.test/supabase/rest/v1/expenses', { headers: [['origin', 'https://otro.test']] })
    for (const c of calls) expect(Object.keys(c.headers).map((k) => k.toLowerCase())).not.toContain('origin')
    expect(calls[0]!.headers['apikey'] ?? calls[0]!.headers['Apikey']).toBe('k')
  })

  it('el método por defecto es GET', async () => {
    const { calls, transport } = fakeTransport()
    await createNativeFetch(transport)('https://api.ejemplo.test/supabase/rest/v1/expenses?select=*')
    expect(calls[0]!.method).toBe('GET')
  })

  it('un error del transporte se propaga (supabase-js lo trata como falla de red)', async () => {
    const f = createNativeFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(f('https://api.ejemplo.test/supabase/rest/v1/expenses')).rejects.toThrow(/fetch/i)
  })
})
