// Copyright (c) 2026 Dinovance
import { CapacitorHttp } from '@capacitor/core'
import { newId } from './idempotency'
import { createTrackedFetch } from './trackedFetch'

/** Petición que el plugin HTTP nativo envía (sin cabecera Origin). */
export interface NativeRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}
export interface NativeResponse {
  status: number
  headers: Record<string, string>
  body: string
}
export type NativeTransport = (req: NativeRequest) => Promise<NativeResponse>

export const WEB_API_BASE = '/supabase'

/** Tiempo máximo de conexión y de lectura del HTTP nativo (el tope total lo pone trackedFetch). */
export const NATIVE_TIMEOUT_MS = 20_000

/** VITE_API_BASE vacío o ausente → '/supabase'; con valor → esa URL sin barra final. Solo http(s). */
/** Con `requireHttps` (compilación de producción) también se rechaza http: el release solo habla TLS (S-07). */
export function resolveApiBase(raw: string | undefined, requireHttps = false): string {
  const value = (raw ?? '').trim()
  if (value === '') return WEB_API_BASE
  let url: URL
  try {
    url = new URL(value)
  } catch (cause) {
    throw new Error('VITE_API_BASE no es una URL válida', { cause })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('VITE_API_BASE debe ser http(s)')
  if (requireHttps && url.protocol !== 'https:') throw new Error('VITE_API_BASE debe ser https')
  return value.replace(/\/+$/, '')
}

export const REQUEST_ID_HEADER = 'x-request-id'

const hasOrigin = (name: string) => name.toLowerCase() === 'origin'

function headersToRecord(init: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  new Headers(init).forEach((value, name) => {
    if (!hasOrigin(name)) out[name] = value
  })
  return out
}

function requestParts(input: Parameters<typeof fetch>[0], init: RequestInit | undefined) {
  const isRequest = typeof input === 'object' && 'url' in input
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method ?? (isRequest ? input.method : 'GET')).toUpperCase()
  const headers = headersToRecord(init?.headers ?? (isRequest ? input.headers : undefined))
  // Correlación de extremo a extremo (observabilidad.md): el mismo id viaja por Worker, Kong, GoTrue y PostgREST.
  if (!Object.keys(headers).some((k) => k.toLowerCase() === REQUEST_ID_HEADER)) headers[REQUEST_ID_HEADER] = newId()
  return { url, method, headers, body: typeof init?.body === 'string' ? init.body : undefined }
}

/** fetch para supabase-js que sale por el transporte nativo y nunca envía Origin. */
export function createNativeFetch(transport: NativeTransport): typeof fetch {
  return async (input, init) => {
    const res = await transport(requestParts(input, init))
    return new Response(res.status === 204 || res.status === 205 ? null : res.body, { status: res.status, headers: res.headers })
  }
}

/** Transporte real: HTTP nativo de Capacitor (Android HttpURLConnection / iOS URLSession). */
export const capacitorTransport: NativeTransport = async (req) => {
  const res = await CapacitorHttp.request({
    url: req.url,
    method: req.method,
    headers: req.headers,
    data: req.body,
    responseType: 'text',
    connectTimeout: NATIVE_TIMEOUT_MS,
    readTimeout: NATIVE_TIMEOUT_MS,
  })
  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '')
  return { status: res.status, headers: res.headers, body }
}

/** fetch nativo con tiempos de espera, reintentos de lectura e indicador de carga (lib/trackedFetch). */
export const nativeFetch: typeof fetch = createTrackedFetch(createNativeFetch(capacitorTransport))

export { createTrackedFetch }
