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

// DEC-01 revisada: el Worker real exige Origin propio en toda escritura y Sec-Fetch-Site ausente o same-origin.
import { apiOrigin } from './nativeApi'

/** Copia LITERAL de la logica de web/worker/proxy.ts (isWrite + isSameSite). Si el Worker cambia, esta copia debe seguirlo. */
const isWrite = (m: string) => !['GET', 'HEAD', 'OPTIONS'].includes(m.toUpperCase())
function isSameSite(headers: Headers, selfOrigin: string, method = 'GET'): boolean {
  const origin = headers.get('origin')
  const site = headers.get('sec-fetch-site')
  if (isWrite(method)) return origin === selfOrigin && (site === null || site === 'same-origin')
  if (origin !== null && origin !== selfOrigin) return false
  return site === null || site === 'same-origin' || site === 'none'
}

describe('Origin del Worker en las peticiones nativas', () => {
  const WORKER = 'https://contigo.dinovance.cl'
  it('apiOrigin deja solo esquema, host y puerto', () => {
    expect(apiOrigin('https://contigo.dinovance.cl/supabase')).toBe(WORKER)
    expect(apiOrigin('https://api.test:8443/x/y?z=1')).toBe('https://api.test:8443')
    expect(apiOrigin('/supabase')).toMatch(/^https?:\/\//)
  })

  it.each(['POST', 'PATCH', 'DELETE', 'PUT', 'GET'])('%s lleva Origin exacto, sin Sec-Fetch-Site, y el Worker lo acepta', async (method) => {
    const { calls, transport } = fakeTransport()
    const f = createNativeFetch(transport, apiOrigin(`${WORKER}/supabase`))
    await f(`${WORKER}/supabase/rest/v1/expenses`, { method, body: method === 'GET' ? undefined : '{}', headers: { 'Sec-Fetch-Site': 'cross-site', ORIGIN: 'https://malo.test' } })
    const h = calls[0]!.headers
    const names = Object.keys(h).map((k) => k.toLowerCase())
    expect(names.filter((k) => k === 'origin')).toHaveLength(1)
    expect(names).not.toContain('sec-fetch-site')
    expect(isSameSite(new Headers(h), WORKER, method)).toBe(true)
  })

  it('sin Origin el Worker sigue rechazando las escrituras (la regla no se debilita)', () => {
    for (const m of ['POST', 'PATCH', 'DELETE']) expect(isSameSite(new Headers(), WORKER, m)).toBe(false)
    expect(isSameSite(new Headers({ origin: 'https://otro.test' }), WORKER, 'POST')).toBe(false)
  })
})
