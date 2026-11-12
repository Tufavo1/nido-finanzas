import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_KEY, normalizeKey, normalizeOrigin, cleanResponseHeaders, isSameSite, isSensitive, upstreamHeaders, upstreamPath, withRealKey, rewriteLocation, isAllowedContentType } from './proxy'

describe('upstreamPath', () => {
  it('deja pasar lo que usa la app', () => {
    expect(upstreamPath('/supabase/rest/v1/expenses')).toBe('/rest/v1/expenses')
    expect(upstreamPath('/supabase/rest/v1/rpc/apply_recurring')).toBe('/rest/v1/rpc/apply_recurring')
    expect(upstreamPath('/supabase/auth/v1/token')).toBe('/auth/v1/token')
    const factor = 'e1d7cebd-2e13-413d-a105-6d941175bc8d'
    expect(upstreamPath(`/supabase/auth/v1/factors/${factor}`)).toBe(`/auth/v1/factors/${factor}`)
    expect(upstreamPath(`/supabase/auth/v1/factors/${factor}/challenge`)).toBe(`/auth/v1/factors/${factor}/challenge`)
    expect(upstreamPath(`/supabase/auth/v1/factors/${factor}/verify`)).toBe(`/auth/v1/factors/${factor}/verify`)
    expect(upstreamPath('/supabase/realtime/v1/websocket')).toBe('/realtime/v1/websocket')
    expect(upstreamPath('/supabase/functions/v1/notify')).toBe('/functions/v1/notify')
  })
  it('bloquea lo demás', () => {
    for (const p of [
      '/supabase/rest/v1/', // esquema OpenAPI
      '/supabase/rest/v1',
      '/supabase/auth/v1/admin/users',
      '/supabase/storage/v1/object/x',
      '/supabase/graphql/v1',
      '/supabase/functions/v1/otra',
      '/supabase/rest/v1/../auth/v1/admin/users',
      '/supabase/rest/v1/%2e%2e/x',
      '/supabase//rest/v1/expenses',
      '/otra/ruta',
    ]) {
      expect(upstreamPath(p), p).toBeNull()
    }
  })
})

describe('isSameSite', () => {
  const self = 'https://contigo.example'
  it('acepta el mismo sitio y navegación directa', () => {
    expect(isSameSite(new Headers({ origin: self }), self)).toBe(true)
    expect(isSameSite(new Headers({ 'sec-fetch-site': 'same-origin' }), self)).toBe(true)
    expect(isSameSite(new Headers(), self)).toBe(true)
  })
  it('rechaza otros orígenes', () => {
    expect(isSameSite(new Headers({ origin: 'https://malo.example' }), self)).toBe(false)
    expect(isSameSite(new Headers({ 'sec-fetch-site': 'cross-site' }), self)).toBe(false)
  })
})

describe('upstreamHeaders', () => {
  it('cambia la clave de relleno por la real y no deja pasar cookies ni referer', () => {
    const h = upstreamHeaders(
      new Headers({ apikey: PLACEHOLDER_KEY, cookie: 'a=b', referer: 'https://x', authorization: `Bearer ${PLACEHOLDER_KEY}`, 'content-type': 'application/json' }),
      'sb_publishable_real',
      '1.2.3.4',
    )
    expect(h.get('apikey')).toBe('sb_publishable_real')
    expect(h.get('authorization')).toBeNull()
    expect(h.get('cookie')).toBeNull()
    expect(h.get('referer')).toBeNull()
    expect(h.get('content-type')).toBe('application/json')
    expect(h.get('x-forwarded-for')).toBe('1.2.3.4')
  })
  it('conserva el token de la sesión', () => {
    const h = upstreamHeaders(new Headers({ authorization: 'Bearer token-persona' }), 'sb_publishable_real', null)
    expect(h.get('authorization')).toBe('Bearer token-persona')
  })
  it('con clave clásica (JWT) la usa como autorización anónima', () => {
    const h = upstreamHeaders(new Headers({ authorization: `Bearer ${PLACEHOLDER_KEY}` }), 'eyJabc', null)
    expect(h.get('authorization')).toBe('Bearer eyJabc')
  })
})

describe('otros', () => {
  it('cambia la clave en la dirección del websocket', () => {
    const u = withRealKey(new URL(`https://x.supabase.co/realtime/v1/websocket?apikey=${PLACEHOLDER_KEY}&vsn=1.0.0`), 'real')
    expect(u.searchParams.get('apikey')).toBe('real')
  })
  it('la respuesta no trae cookies ni pistas del servidor y reescribe ubicaciones', () => {
    const h = cleanResponseHeaders(
      new Headers({ 'set-cookie': 'a=b', server: 'cloudflare', 'sb-gateway-version': '1', 'content-type': 'application/json', location: 'https://x.supabase.co/auth/v1/verify?x=1' }),
      'https://x.supabase.co',
    )
    expect(h.get('set-cookie')).toBeNull()
    expect(h.get('server')).toBeNull()
    expect(h.get('sb-gateway-version')).toBeNull()
    expect(h.get('location')).toBe('/supabase/auth/v1/verify?x=1')
    expect(h.get('cache-control')).toBe('no-store')
  })
  it('reconoce los endpoints sensibles de la cuenta', () => {
    expect(isSensitive('/auth/v1/token')).toBe(true)
    expect(isSensitive('/rest/v1/expenses')).toBe(false)
    expect(isSensitive('/auth/v1/factors/123e4567-e89b-12d3-a456-426614174000/verify')).toBe(true)
    expect(isSensitive('/auth/v1/factors/123e4567-e89b-12d3-a456-426614174000')).toBe(false)
  })
})

describe('normalizeOrigin', () => {
  it('arregla lo típico al pegar un secreto', () => {
    for (const raw of ['https://x.supabase.co', ' https://x.supabase.co\n', '"https://x.supabase.co/"', 'x.supabase.co', "'https://x.supabase.co/rest/v1'"]) {
      expect(normalizeOrigin(raw), raw).toBe('https://x.supabase.co')
    }
  })
  it('rechaza lo vacío o roto', () => {
    expect(normalizeOrigin('')).toBeNull()
    expect(normalizeOrigin(undefined)).toBeNull()
    expect(normalizeOrigin('https://')).toBeNull()
  })
  it('limpia la clave', () => {
    expect(normalizeKey(' "sb_publishable_abc"\n')).toBe('sb_publishable_abc')
    expect(normalizeKey('')).toBeNull()
  })
})

describe('rewriteLocation (inicio de sesión con Google)', () => {
  const origin = 'https://abc.supabase.co'
  it('la redirección a Google pasa tal cual', () => {
    const g = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1&state=x'
    expect(rewriteLocation(g, origin)).toBe(g)
  })
  it('una redirección del proyecto se reescribe al proxy', () => {
    expect(rewriteLocation(`${origin}/auth/v1/callback?x=1`, origin)).toBe('/supabase/auth/v1/callback?x=1')
  })
  it('cualquier otra dirección externa vuelve al inicio', () => {
    expect(rewriteLocation('https://evil.com/', origin)).toBe('/')
    expect(rewriteLocation('https://accounts.google.com.evil.com/o/oauth2/v2/auth?x=1', origin)).toBe('/')
    expect(rewriteLocation('http://accounts.google.com/o/oauth2/v2/auth?x=1', origin)).toBe('/')
    expect(rewriteLocation('https://accounts.google.com/other', origin)).toBe('/')
  })
})

describe('isSameSite en escrituras (CSRF)', () => {
  const self = 'https://contigo.example'
  it('una escritura debe probar que viene de este sitio', () => {
    expect(isSameSite(new Headers({ origin: self }), self, 'POST')).toBe(true)
    expect(isSameSite(new Headers({ origin: self, 'sec-fetch-site': 'same-origin' }), self, 'DELETE')).toBe(true)
  })
  it('sin origen, o con otro, la escritura se rechaza', () => {
    expect(isSameSite(new Headers(), self, 'POST')).toBe(false)
    expect(isSameSite(new Headers({ 'sec-fetch-site': 'none' }), self, 'PATCH')).toBe(false)
    expect(isSameSite(new Headers({ origin: 'null' }), self, 'POST')).toBe(false)
    expect(isSameSite(new Headers({ origin: self, 'sec-fetch-site': 'same-site' }), self, 'POST')).toBe(false)
  })
  it('leer sigue aceptando navegación directa', () => {
    expect(isSameSite(new Headers(), self, 'GET')).toBe(true)
  })
})

describe('isAllowedContentType', () => {
  it('las escrituras solo aceptan JSON (o venir sin cuerpo)', () => {
    expect(isAllowedContentType('POST', 'application/json')).toBe(true)
    expect(isAllowedContentType('POST', 'application/json;charset=UTF-8')).toBe(true)
    expect(isAllowedContentType('DELETE', null)).toBe(true)
  })
  it('rechaza los formatos que un formulario de otro sitio puede enviar', () => {
    for (const ct of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain', 'TEXT/PLAIN;charset=UTF-8']) {
      expect(isAllowedContentType('POST', ct), ct).toBe(false)
    }
  })
  it('leer no lleva cuerpo: no se revisa', () => {
    expect(isAllowedContentType('GET', 'text/plain')).toBe(true)
  })
})
