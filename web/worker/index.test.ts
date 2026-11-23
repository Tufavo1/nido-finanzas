import { describe, expect, it } from 'vitest'
import { handle } from './index'

const SELF = 'https://contigo.example'
const env = { SUPABASE_ORIGIN: 'https://abc.supabase.co', SUPABASE_KEY: 'sb_publishable_real' }
const fast = { readTimeoutMs: 20, writeTimeoutMs: 20, readRetries: 2, backoffMs: 1 }

const get = (path: string, headers: Record<string, string> = {}) => new Request(`${SELF}${path}`, { headers })
const post = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${SELF}${path}`, { method: 'POST', body: '{"a":1}', headers: { origin: SELF, 'content-type': 'application/json', ...headers } })
const hang = (_u: unknown, init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))

describe('proxy: reintentos y tiempos de espera', () => {
  it('una lectura se reintenta si el servidor falla y luego responde', async () => {
    const answers = [new Response('x', { status: 503 }), new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })]
    let calls = 0
    const res = await handle(get('/supabase/rest/v1/expenses'), env, { fetch: async () => answers[calls++]!, ...fast })
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('una escritura nunca se repite sola: podría guardar dos veces', async () => {
    let calls = 0
    const res = await handle(post('/supabase/rest/v1/expenses'), env, { fetch: async () => (calls++, new Response('x', { status: 503 })), ...fast })
    expect(res.status).toBe(503)
    expect(calls).toBe(1)
  })

  it('si el servidor no responde a tiempo contesta 504 sin dar detalles', async () => {
    const res = await handle(post('/supabase/rest/v1/expenses'), env, { fetch: hang, ...fast })
    expect(res.status).toBe(504)
    expect(await res.text()).not.toContain('supabase.co')
  })

  it('si la red falla contesta 502 sin dar detalles', async () => {
    const res = await handle(get('/supabase/rest/v1/expenses'), env, { fetch: () => Promise.reject(new TypeError('connect abc.supabase.co')), ...fast })
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('supabase.co')
  })

  it('llama al servidor real con la clave real', async () => {
    let seen: { url: string; key: string | null } | null = null
    await handle(get('/supabase/rest/v1/expenses?select=*'), env, {
      fetch: async (u, init) => {
        seen = { url: String(u), key: new Headers(init?.headers).get('apikey') }
        return new Response('[]')
      },
      ...fast,
    })
    expect(seen).toEqual({ url: 'https://abc.supabase.co/rest/v1/expenses?select=*', key: 'sb_publishable_real' })
  })
})

describe('proxy: protección contra peticiones de otros sitios (CSRF)', () => {
  const never = { fetch: () => Promise.reject(new Error('no debió llamar al servidor')), ...fast }

  it('una escritura sin origen se rechaza', async () => {
    const req = new Request(`${SELF}/supabase/rest/v1/expenses`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
    expect((await handle(req, env, never)).status).toBe(403)
  })

  it('una escritura desde otro sitio se rechaza', async () => {
    expect((await handle(post('/supabase/rest/v1/expenses', { origin: 'https://malo.example' }), env, never)).status).toBe(403)
    expect((await handle(post('/supabase/rest/v1/expenses', { 'sec-fetch-site': 'same-site' }), env, never)).status).toBe(403)
  })

  it('una escritura enviada como formulario se rechaza', async () => {
    for (const ct of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain']) {
      expect((await handle(post('/supabase/rest/v1/expenses', { 'content-type': ct }), env, never)).status, ct).toBe(415)
    }
  })
})

describe('proxy: límite de intentos', () => {
  it('pasado el límite contesta 429 y dice cuánto esperar', async () => {
    const limited = { ...env, RL_GENERAL: { limit: async () => ({ success: false }) } }
    const res = await handle(get('/supabase/rest/v1/expenses'), limited, { fetch: async () => new Response('[]'), ...fast })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
  })

  it('las escrituras tienen su propio cupo por persona, más estricto', async () => {
    const keys: string[] = []
    const rl = (name: string, success: boolean) => ({
      limit: async ({ key }: { key: string }) => {
        keys.push(`${name}:${key}`)
        return { success }
      },
    })
    const e = { ...env, RL_GENERAL: rl('general', true), RL_WRITE: rl('write', false) }
    const res = await handle(post('/supabase/rest/v1/expenses', { 'cf-connecting-ip': '1.2.3.4' }), e, { fetch: async () => new Response('{}'), ...fast })
    expect(res.status).toBe(429)
    expect(keys).toEqual(['general:g:1.2.3.4', 'write:w:1.2.3.4'])
  })
})

describe('proxy: páginas de error', () => {
  const NAV = { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }
  const never = { fetch: () => Promise.reject(new Error('no debió llamar al servidor')), ...fast }

  it('quien abre una dirección prohibida en el navegador ve la página 404, no un texto técnico', async () => {
    const res = await handle(get('/supabase/storage/v1/object/x', NAV), env, never)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await res.text()).toContain('No encontramos esta página')
  })

  it('403 desde otro sitio: página de sin permiso', async () => {
    const res = await handle(get('/supabase/rest/v1/expenses', { ...NAV, 'sec-fetch-site': 'cross-site' }), env, never)
    expect(res.status).toBe(403)
    expect(await res.text()).toContain('No tienes permiso para ver esto')
  })

  it('502 y 504: página con reintentar, sin detalles del servidor real', async () => {
    const down = await handle(get('/supabase/rest/v1/expenses', NAV), env, { fetch: () => Promise.reject(new TypeError('connect abc.supabase.co')), ...fast })
    expect(down.status).toBe(502)
    const html = await down.text()
    expect(html).toContain('El servicio no responde')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('supabase.co')
    const slow = await handle(get('/supabase/rest/v1/expenses', NAV), env, { fetch: hang, ...fast, readRetries: 0 })
    expect(slow.status).toBe(504)
    expect(await slow.text()).toContain('Está tardando demasiado')
  })

  it('429: página de demasiados intentos, con cuánto esperar', async () => {
    const limited = { ...env, RL_GENERAL: { limit: async () => ({ success: false }) } }
    const res = await handle(get('/supabase/rest/v1/expenses', NAV), limited, never)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(await res.text()).toContain('Demasiados intentos')
  })

  it('la página de error no se guarda en caché ni puede incrustarse o ejecutar código', async () => {
    const res = await handle(get('/supabase/nada', NAV), env, never)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('la app sigue recibiendo JSON', async () => {
    const res = await handle(get('/supabase/nada', { accept: 'application/json' }), env, never)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ message: 'No encontrado' })
  })

  it('si el servidor real se cae (502, 503, 504) nunca se entrega su página: se responde con la propia', async () => {
    const res = await handle(get('/supabase/rest/v1/expenses', NAV), env, {
      fetch: async () => new Response('<html>cloudflare abc.supabase.co origin error</html>', { status: 503, headers: { 'content-type': 'text/html' } }),
      ...fast,
    })
    expect(res.status).toBe(503)
    const html = await res.text()
    expect(html).toContain('Estamos en mantención')
    expect(html).not.toContain('supabase.co')
  })
})
