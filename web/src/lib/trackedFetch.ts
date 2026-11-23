import { authLabel, beginRead, beginWait, beginWrite } from './activity'
import { isIdempotentMethod, withResilience } from './resilience'

/** Leer: hasta 20 s por intento y un reintento. El proxy ya reintenta por su lado y contesta antes de ese plazo. */
const READ = { retries: 1, timeoutMs: 20_000, backoffMs: 400 }
/** Guardar, editar, borrar o iniciar sesión: un solo intento de hasta 30 s. Repetirlo sin duplicar es tarea de lib/idempotency.ts. */
const WRITE = { retries: 0, timeoutMs: 30_000 }

type Input = Parameters<typeof fetch>[0]
type Init = Parameters<typeof fetch>[1]

/** fetch con tiempo máximo; las lecturas además se reintentan si la red o el servicio fallan un momento */
const send = (base: typeof fetch, method: string, input: Input, init: Init): Promise<Response> =>
  withResilience((signal) => base(input, { ...init, signal }), { ...(isIdempotentMethod(method) ? READ : WRITE), signal: init?.signal })

/** Cuánto espera una escritura a que vuelva el internet antes de intentarlo igual (y mostrar el error si falla) */
const WAIT_ONLINE_MS = 20000

function waitOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve()
  const end = beginWait()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      window.removeEventListener('online', done)
      end()
      resolve()
    }
    const timer = setTimeout(done, WAIT_ONLINE_MS)
    window.addEventListener('online', done)
  })
}

/**
 * fetch que usa el cliente de Supabase. Avisa al cargador global cuando guarda, edita o elimina,
 * cuando se inicia o cierra sesión, y cuando una lectura va lenta. La renovación automática de la
 * sesión, el tiempo real y las funciones no cuentan, para que nunca bloqueen la pantalla solas.
 * `base` es el fetch que realmente sale a la red: el del navegador en la web, el HTTP nativo en la app.
 */
export function createTrackedFetch(base: typeof fetch): typeof fetch {
  const track = async (method: string, label: string, input: Input, init: Init) => {
    const end = beginWrite(method, label)
    try {
      await waitOnline()
      return await send(base, method, input, init)
    } finally {
      end()
    }
  }

  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
    const isData = url.includes('/rest/v1/')
    const isAuth = url.includes('/auth/v1/')
    if (!isData && !isAuth) return base(input, init)

    if (isAuth) {
      const label = authLabel(url, method)
      if (label === null) return send(base, method, input, init)
      return track(method, label, input, init)
    }

    if (method === 'GET' || method === 'HEAD') {
      const end = beginRead()
      try {
        return await send(base, method, input, init)
      } finally {
        end()
      }
    }

    return track(method, '', input, init)
  }
}

/** El fetch de siempre (web): sale por el fetch global del navegador, que se busca en cada llamada. */
export const trackedFetch: typeof fetch = createTrackedFetch((input, init) => fetch(input, init))
