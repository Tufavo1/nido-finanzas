import { describe, expect, it } from 'vitest'
import { TimeoutError, backoffDelay, isIdempotentMethod, withResilience } from './resilience'

const ok = () => new Response('ok', { status: 200 })
const status = (s: number) => new Response('x', { status: s })
/** Intento que nunca responde: solo termina cuando lo cancelan */
const hang = (signal: AbortSignal) =>
  new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
const noSleep = () => Promise.resolve()

describe('isIdempotentMethod', () => {
  it('solo leer se puede repetir sin riesgo', () => {
    expect(isIdempotentMethod('GET')).toBe(true)
    expect(isIdempotentMethod('head')).toBe(true)
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) expect(isIdempotentMethod(m), m).toBe(false)
  })
})

describe('backoffDelay', () => {
  it('se duplica en cada intento', () => {
    expect([0, 1, 2].map((i) => backoffDelay(i, 300, () => 0))).toEqual([300, 600, 1200])
  })
  it('suma hasta un 25 % al azar para que no reintenten todos a la vez', () => {
    expect(backoffDelay(0, 400, () => 1)).toBe(500)
  })
})

describe('withResilience', () => {
  it('si responde bien a la primera no reintenta', async () => {
    let calls = 0
    const res = await withResilience(async () => (calls++, ok()), { retries: 2, timeoutMs: 1000, sleep: noSleep })
    expect(res.status).toBe(200)
    expect(calls).toBe(1)
  })

  it('reintenta cuando el servidor está caído (502, 503, 504) y entrega la respuesta buena', async () => {
    const answers = [status(503), status(502), ok()]
    let calls = 0
    const res = await withResilience(async () => answers[calls++]!, { retries: 2, timeoutMs: 1000, sleep: noSleep })
    expect(res.status).toBe(200)
    expect(calls).toBe(3)
  })

  it('reintenta cuando falla la red', async () => {
    let calls = 0
    const res = await withResilience(
      async () => {
        if (calls++ === 0) throw new TypeError('Failed to fetch')
        return ok()
      },
      { retries: 1, timeoutMs: 1000, sleep: noSleep },
    )
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('al agotar los intentos entrega el último error del servidor', async () => {
    let calls = 0
    const res = await withResilience(async () => (calls++, status(503)), { retries: 2, timeoutMs: 1000, sleep: noSleep })
    expect(res.status).toBe(503)
    expect(calls).toBe(3)
  })

  it('al agotar los intentos lanza el error de red', async () => {
    await expect(withResilience(() => Promise.reject(new TypeError('Failed to fetch')), { retries: 1, timeoutMs: 1000, sleep: noSleep })).rejects.toThrow('Failed to fetch')
  })

  it('con 0 reintentos (guardar, editar, borrar) nunca repite', async () => {
    let calls = 0
    const res = await withResilience(async () => (calls++, status(503)), { retries: 0, timeoutMs: 1000, sleep: noSleep })
    expect(res.status).toBe(503)
    expect(calls).toBe(1)
  })

  it('no reintenta errores que no son pasajeros (400, 401, 404, 429)', async () => {
    for (const s of [400, 401, 404, 429]) {
      let calls = 0
      const res = await withResilience(async () => (calls++, status(s)), { retries: 2, timeoutMs: 1000, sleep: noSleep })
      expect(res.status).toBe(s)
      expect(calls, String(s)).toBe(1)
    }
  })

  it('corta un intento que no responde a tiempo', async () => {
    await expect(withResilience(hang, { retries: 0, timeoutMs: 10, sleep: noSleep })).rejects.toBeInstanceOf(TimeoutError)
  })

  it('tras un intento colgado, el siguiente puede responder', async () => {
    let calls = 0
    const res = await withResilience((signal) => (calls++ === 0 ? hang(signal) : Promise.resolve(ok())), { retries: 1, timeoutMs: 10, sleep: noSleep })
    expect(res.status).toBe(200)
  })

  it('espera cada vez más entre intentos', async () => {
    const waits: number[] = []
    await withResilience(async () => status(503), {
      retries: 2,
      timeoutMs: 1000,
      backoffMs: 100,
      random: () => 0,
      sleep: (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    })
    expect(waits).toEqual([100, 200])
  })

  it('si quien llama cancela, no reintenta', async () => {
    const outer = new AbortController()
    let calls = 0
    const p = withResilience(
      (signal) => {
        calls++
        return hang(signal)
      },
      { retries: 3, timeoutMs: 5000, signal: outer.signal, sleep: noSleep },
    )
    outer.abort()
    await expect(p).rejects.toThrow()
    expect(calls).toBe(1)
  })
})
