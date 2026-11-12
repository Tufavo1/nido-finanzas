import { errorPageHtml, wantsHtml } from '../src/lib/httpErrors'
import { TimeoutError, withResilience } from '../src/lib/resilience'
import {
  MAX_BODY_BYTES,
  cleanResponseHeaders,
  isAllowedContentType,
  isMethodAllowed,
  isSameSite,
  isSensitive,
  isWriteMethod,
  json,
  normalizeKey,
  normalizeOrigin,
  upstreamHeaders,
  upstreamPath,
  withRealKey,
} from './proxy'

interface Limiter {
  limit: (opts: { key: string }) => Promise<{ success: boolean }>
}

export interface Env {
  /** Secreto: dirección real del proyecto, por ejemplo https://xxxx.supabase.co */
  SUPABASE_ORIGIN: string
  /** Secreto: clave publicable (o anon) del proyecto */
  SUPABASE_KEY: string
  RL_GENERAL?: Limiter
  RL_AUTH?: Limiter
  RL_WRITE?: Limiter
}

/** Lo que se puede cambiar en las pruebas: el fetch y los tiempos */
export interface Deps {
  fetch?: (input: URL | string, init?: RequestInit) => Promise<Response>
  /** Tiempo máximo de cada intento de lectura */
  readTimeoutMs?: number
  /** Tiempo máximo de una escritura (un solo intento) */
  writeTimeoutMs?: number
  /** Reintentos de una lectura ante fallas pasajeras */
  readRetries?: number
  backoffMs?: number
}

/** Encabezados de la página de error: no se guarda, no se incrusta y no puede cargar ni ejecutar nada */
const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
}

/** Respuesta de error: una página clara si alguien abrió la dirección en el navegador; JSON para la app */
function fail(request: Request, status: number, message: string, extra: Record<string, string> = {}): Response {
  if (!wantsHtml(request.headers.get('accept'))) return json(status, message, extra)
  return new Response(errorPageHtml(status), { status, headers: { ...PAGE_HEADERS, ...extra } })
}

const DOWN: Record<number, string> = {
  502: 'El servicio no responde. Intenta de nuevo en un momento.',
  503: 'El servicio está en mantención. Intenta de nuevo en unos minutos.',
  504: 'El servicio está tardando demasiado. Intenta de nuevo en un momento.',
}

export async function handle(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const url = new URL(request.url)
  const method = request.method.toUpperCase()
  const tooMany = () => fail(request, 429, 'Demasiados intentos. Espera un momento.', { 'retry-after': '30' })

  if (!isMethodAllowed(method)) return fail(request, 405, 'Método no permitido')
  if (!isSameSite(request.headers, url.origin, method)) return fail(request, 403, 'Origen no permitido')
  if (!isAllowedContentType(method, request.headers.get('content-type'))) return fail(request, 415, 'Formato no permitido')

  const path = upstreamPath(url.pathname)
  if (!path) return fail(request, 404, 'No encontrado')

  const origin = normalizeOrigin(env.SUPABASE_ORIGIN)
  const apiKey = normalizeKey(env.SUPABASE_KEY)
  if (!origin || !apiKey) {
    console.error('Proxy sin configurar: SUPABASE_ORIGIN o SUPABASE_KEY faltan o no son válidos')
    return fail(request, 503, 'Servicio no configurado')
  }

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_BYTES) return fail(request, 413, 'Solicitud demasiado grande')

  // Límite por persona (IP): más estricto en las puertas de entrada de la cuenta y en las escrituras
  // Sin IP (no debería pasar en Cloudflare) todos comparten un mismo cupo: nunca se salta el límite
  const ip = request.headers.get('cf-connecting-ip')
  const who = ip ?? 'sin-ip'
  const sensitive = isSensitive(path)
  const write = isWriteMethod(method)
  const limiter = sensitive ? env.RL_AUTH : env.RL_GENERAL
  if (!limiter) console.warn('Proxy sin límite de intentos: falta el binding RL_GENERAL / RL_AUTH (ver wrangler.jsonc)')
  if (limiter && !(await limiter.limit({ key: `${sensitive ? 'a' : 'g'}:${who}` })).success) return tooMany()
  if (write && !sensitive && env.RL_WRITE && !(await env.RL_WRITE.limit({ key: `w:${who}` })).success) return tooMany()

  const target = withRealKey(new URL(`${origin}${path}${url.search}`), apiKey)
  const headers = upstreamHeaders(request.headers, apiKey, ip)
  const doFetch = deps.fetch ?? fetch
  const init: RequestInit = { method, headers, body: write ? request.body : undefined, redirect: 'manual' }

  try {
    // Tiempo real (websocket): conexión larga, sin tiempo máximo ni reintentos; se entrega tal cual
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const ws = await doFetch(target, init)
      if (ws.status === 101) return ws
      return new Response(ws.body, { status: ws.status, headers: cleanResponseHeaders(ws.headers, origin) })
    }

    // Leer se puede repetir sin riesgo; escribir va una sola vez (el cuerpo ya se consumió y podría duplicarse)
    const upstream = await withResilience((signal) => doFetch(target, { ...init, signal }), {
      retries: write ? 0 : (deps.readRetries ?? 1),
      timeoutMs: write ? (deps.writeTimeoutMs ?? 25_000) : (deps.readTimeoutMs ?? 8_000),
      backoffMs: deps.backoffMs ?? 200,
    })
    // Servidor real caído: nunca se entrega su página (trae pistas de la dirección real); se responde con la propia
    const down = DOWN[upstream.status]
    if (down) {
      void upstream.body?.cancel().catch(() => undefined)
      console.error('Proxy: el servidor respondió', upstream.status)
      return fail(request, upstream.status, down)
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: cleanResponseHeaders(upstream.headers, origin),
    })
  } catch (e) {
    // Nunca se devuelve el detalle del error: podría incluir la dirección real
    if (e instanceof TimeoutError) {
      console.error('Proxy: el servidor no respondió a tiempo')
      return fail(request, 504, DOWN[504]!)
    }
    console.error('Proxy: fallo al contactar al servidor', e instanceof Error ? e.name : 'error')
    return fail(request, 502, DOWN[502]!)
  }
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
}
