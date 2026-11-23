// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { createNativeFetch, createTrackedFetch, REQUEST_ID_HEADER, type NativeRequest } from './nativeApi'

// QA pidió poder probar que la petición nativa pasa por el fetch con tiempos de espera sin tocar globales:
// createTrackedFetch(base) recibe el fetch que sale a la red. Las URL de abajo no son /rest ni /auth (no usan navigator).
describe('createTrackedFetch(base)', () => {
  it('delega en la base inyectada y devuelve su respuesta', async () => {
    const calls: string[] = []
    const base: typeof fetch = async (input) => (calls.push(String(input)), new Response('ok'))
    const res = await createTrackedFetch(base)('https://api.ejemplo.test/supabase/functions/v1/notify')
    expect(await res.text()).toBe('ok')
    expect(calls).toEqual(['https://api.ejemplo.test/supabase/functions/v1/notify'])
  })

  it('el fetch nativo envía x-request-id (uno nuevo por petición) y sigue sin Origin', async () => {
    const seen: NativeRequest[] = []
    const f = createNativeFetch(async (req) => (seen.push(req), { status: 200, headers: {}, body: '{}' }))
    await f('https://api.ejemplo.test/supabase/rest/v1/expenses', { headers: { Origin: 'https://x.test' } })
    await f('https://api.ejemplo.test/supabase/rest/v1/expenses')
    const ids = seen.map((r) => r.headers[REQUEST_ID_HEADER])
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(ids[0]).not.toBe(ids[1])
    expect(seen.every((r) => !Object.keys(r.headers).some((k) => k.toLowerCase() === 'origin'))).toBe(true)
  })

  it('respeta un x-request-id que ya venga puesto', async () => {
    const seen: NativeRequest[] = []
    const f = createNativeFetch(async (req) => (seen.push(req), { status: 200, headers: {}, body: '' }))
    await f('https://api.ejemplo.test/x', { headers: { 'X-Request-Id': 'abc-123' } })
    expect(seen[0]!.headers['x-request-id']).toBe('abc-123')
  })
})
