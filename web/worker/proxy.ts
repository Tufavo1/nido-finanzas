/**
 * Lógica pura del proxy hacia Supabase. Vive aparte de index.ts para poder probarla sin Cloudflare.
 * El navegador solo conoce «/supabase/...» de este mismo sitio: la dirección real del proyecto y la
 * clave pública quedan como secretos del Worker y nunca viajan en el código que se descarga.
 */

export const PREFIX = '/supabase'
/** Valor de relleno que usa el navegador; el Worker lo cambia por la clave real */
export const PLACEHOLDER_KEY = 'sb_publishable_via_proxy'
export const MAX_BODY_BYTES = 1_048_576

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])

/** Solo lo que la app usa de verdad. Todo lo demás (storage, graphql, admin, esquema…) no existe para el exterior. */
const ALLOWED: RegExp[] = [
  /^\/auth\/v1\/(?!admin(\/|$))[a-z_/-]+$/i,
  /^\/rest\/v1\/[A-Za-z_][A-Za-z0-9_]*$/, // tablas
  /^\/rest\/v1\/rpc\/[A-Za-z_][A-Za-z0-9_]*$/, // funciones
  /^\/realtime\/v1\/websocket$/,
  /^\/functions\/v1\/notify$/,
]

/** Endpoints de autenticación que se limitan más (fuerza bruta, correos masivos) */
const SENSITIVE_AUTH = /^\/auth\/v1\/(token|signup|recover|otp|verify|resend|reauthenticate|user)$/i

/** Limpia lo que suele colarse al pegar un secreto: espacios, comillas, barra final o falta de https:// */
export function normalizeOrigin(raw: string | undefined): string | null {
  let v = (raw ?? '').trim().replace(/^["']+|["']+$/g, '').trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    return new URL(v).origin
  } catch {
    return null
  }
}

/** Quita espacios y comillas de la clave pegada */
export const normalizeKey = (raw: string | undefined): string | null => (raw ?? '').trim().replace(/^["']+|["']+$/g, '').trim() || null

export const isMethodAllowed = (method: string): boolean => METHODS.has(method.toUpperCase())

/** «/supabase/rest/v1/expenses» -> «/rest/v1/expenses»; null si no está permitido */
export function upstreamPath(pathname: string): string | null {
  if (!pathname.startsWith(`${PREFIX}/`)) return null
  const rest = pathname.slice(PREFIX.length)
  if (rest.includes('..') || rest.includes('//') || rest.includes('%2e') || rest.includes('%2E')) return null
  return ALLOWED.some((re) => re.test(rest)) ? rest : null
}

export const isSensitive = (path: string): boolean => SENSITIVE_AUTH.test(path)

/** Rechaza todo lo que venga de otro sitio (CSRF, usar el proxy desde páginas ajenas) */
export function isSameSite(headers: Headers, selfOrigin: string): boolean {
  const origin = headers.get('origin')
  if (origin !== null && origin !== selfOrigin) return false
  const site = headers.get('sec-fetch-site')
  return site === null || site === 'same-origin' || site === 'none'
}

const FORWARD_REQUEST = new Set([
  'accept',
  'accept-language',
  'accept-profile',
  'content-profile',
  'content-type',
  'content-length',
  'prefer',
  'range',
  'range-unit',
  'if-none-match',
  'x-client-info',
  'x-supabase-api-version',
  'user-agent',
  'upgrade',
  'connection',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-protocol',
  'sec-websocket-extensions',
])

/** Arma los encabezados hacia Supabase: solo los necesarios, con la clave real y la IP real de la persona */
export function upstreamHeaders(incoming: Headers, apiKey: string, clientIp: string | null): Headers {
  const out = new Headers()
  for (const [k, v] of incoming) if (FORWARD_REQUEST.has(k.toLowerCase())) out.set(k, v)
  out.set('apikey', apiKey)

  // Sesión iniciada: el token de la persona. Sin sesión (o con la clave de relleno): nada, o la clave real si es JWT clásica.
  const auth = incoming.get('authorization')
  if (auth && !auth.includes(PLACEHOLDER_KEY)) out.set('authorization', auth)
  else if (apiKey.startsWith('eyJ')) out.set('authorization', `Bearer ${apiKey}`)

  // Para que los límites por IP de Supabase cuenten a cada persona y no a todo el sitio junto
  if (clientIp) {
    out.set('x-forwarded-for', clientIp)
    out.set('x-real-ip', clientIp)
  }
  return out
}

/** El websocket de tiempo real manda la clave en la dirección: se cambia la de relleno por la real */
export function withRealKey(url: URL, apiKey: string): URL {
  if (url.searchParams.has('apikey')) url.searchParams.set('apikey', apiKey)
  return url
}

const FORWARD_RESPONSE = new Set([
  'content-type',
  'content-range',
  'content-encoding',
  'content-length',
  'content-profile',
  'etag',
  'preference-applied',
  'retry-after',
  'x-supabase-api-version',
  'www-authenticate',
])

/** Respuesta limpia: sin cookies, sin pistas del servidor real, sin caché y con la ubicación reescrita */
export function cleanResponseHeaders(upstream: Headers, upstreamOrigin: string): Headers {
  const out = new Headers()
  for (const [k, v] of upstream) if (FORWARD_RESPONSE.has(k.toLowerCase())) out.set(k, v)
  const loc = upstream.get('location')
  if (loc) out.set('location', loc.startsWith(upstreamOrigin) ? `${PREFIX}${loc.slice(upstreamOrigin.length)}` : '/')
  out.set('cache-control', 'no-store')
  out.set('x-content-type-options', 'nosniff')
  return out
}

export const json = (status: number, message: string, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  })
