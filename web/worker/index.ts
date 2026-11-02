import {
  MAX_BODY_BYTES,
  cleanResponseHeaders,
  isMethodAllowed,
  isSameSite,
  isSensitive,
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

interface Env {
  /** Secreto: dirección real del proyecto, por ejemplo https://xxxx.supabase.co */
  SUPABASE_ORIGIN: string
  /** Secreto: clave publicable (o anon) del proyecto */
  SUPABASE_KEY: string
  RL_GENERAL?: Limiter
  RL_AUTH?: Limiter
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (!isMethodAllowed(request.method)) return json(405, 'Método no permitido')
    if (!isSameSite(request.headers, url.origin)) return json(403, 'Origen no permitido')

    const path = upstreamPath(url.pathname)
    if (!path) return json(404, 'No encontrado')

    const origin = normalizeOrigin(env.SUPABASE_ORIGIN)
    const apiKey = normalizeKey(env.SUPABASE_KEY)
    if (!origin || !apiKey) {
      console.error('Proxy sin configurar: SUPABASE_ORIGIN o SUPABASE_KEY faltan o no son válidos')
      return json(503, 'Servicio no configurado')
    }

    const length = Number(request.headers.get('content-length') ?? 0)
    if (length > MAX_BODY_BYTES) return json(413, 'Solicitud demasiado grande')

    // Límite por persona (IP): más estricto en las puertas de entrada de la cuenta
    const ip = request.headers.get('cf-connecting-ip')
    const limiter = isSensitive(path) ? env.RL_AUTH : env.RL_GENERAL
    if (!limiter) console.warn('Proxy sin límite de intentos: falta el binding RL_GENERAL / RL_AUTH (ver wrangler.jsonc)')
    if (limiter) {
      // Sin IP (no debería pasar en Cloudflare) todos comparten un mismo cupo: nunca se salta el límite
      const { success } = await limiter.limit({ key: `${isSensitive(path) ? 'a' : 'g'}:${ip ?? 'sin-ip'}` })
      if (!success) return json(429, 'Demasiados intentos. Espera un momento.', { 'retry-after': '30' })
    }

    const target = withRealKey(new URL(`${origin}${path}${url.search}`), apiKey)
    const headers = upstreamHeaders(request.headers, apiKey, ip)
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
      })
      // Tiempo real (websocket): se entrega tal cual
      if (upstream.status === 101) return upstream
      return new Response(upstream.body, {
        status: upstream.status,
        headers: cleanResponseHeaders(upstream.headers, origin),
      })
    } catch (e) {
      console.error('Proxy: fallo al contactar al servidor', e instanceof Error ? e.name : 'error')
      // Nunca se devuelve el detalle del error: podría incluir la dirección real
      return json(502, 'El servicio no responde. Intenta de nuevo en un momento.')
    }
  },
}
