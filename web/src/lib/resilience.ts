/**
 * Tiempos de espera y reintentos para hablar con el servidor. Lo usan la app (lib/trackedFetch.ts)
 * y el proxy (worker/index.ts), por eso no depende ni del navegador ni de Cloudflare.
 *
 * Reglas:
 *  - Cada intento tiene un tiempo máximo; si no responde, se corta.
 *  - Solo se repite lo que es seguro repetir: leer (GET, HEAD). Guardar, editar o borrar no se repiten
 *    solos porque podrían aplicarse dos veces; eso lo resuelve lib/idempotency.ts.
 *  - Se reintenta ante fallas pasajeras (red caída, 502, 503, 504), esperando cada vez más.
 */

export class TimeoutError extends Error {
  constructor(message = 'El servidor no respondió a tiempo') {
    super(message)
    this.name = 'TimeoutError'
  }
}

const RETRY_STATUS = new Set([502, 503, 504])

export const isIdempotentMethod = (method: string): boolean => {
  const m = method.toUpperCase()
  return m === 'GET' || m === 'HEAD'
}

/** Espera antes del reintento número `attempt` (0 = el primero): se duplica cada vez y suma hasta 25 % al azar */
export function backoffDelay(attempt: number, baseMs: number, random: () => number = Math.random): number {
  const base = baseMs * 2 ** attempt
  return Math.round(base + base * 0.25 * random())
}

export interface ResilienceOptions {
  /** Cuántas veces más se intenta después del primer intento (0 = nunca repetir) */
  retries: number
  /** Tiempo máximo de cada intento hasta que llega la respuesta */
  timeoutMs: number
  backoffMs?: number
  /** Señal de quien llama: si cancela, se corta y no se reintenta */
  signal?: AbortSignal | null
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Ejecuta `attempt` con tiempo máximo y reintentos. El intento debe respetar la señal que recibe. */
export async function withResilience(attempt: (signal: AbortSignal) => Promise<Response>, o: ResilienceOptions): Promise<Response> {
  const sleep = o.sleep ?? defaultSleep
  for (let i = 0; ; i++) {
    const ctrl = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, o.timeoutMs)
    const onAbort = () => ctrl.abort()
    if (o.signal?.aborted) ctrl.abort()
    else o.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await attempt(ctrl.signal)
      if (!RETRY_STATUS.has(res.status) || i >= o.retries) return res
      // Se descarta la respuesta fallida para no dejar la conexión abierta
      void res.body?.cancel().catch(() => undefined)
    } catch (e) {
      if (o.signal?.aborted) throw e
      if (i >= o.retries) throw timedOut ? new TimeoutError() : e
    } finally {
      clearTimeout(timer)
      o.signal?.removeEventListener('abort', onAbort)
    }
    await sleep(backoffDelay(i, o.backoffMs ?? 300, o.random))
  }
}
