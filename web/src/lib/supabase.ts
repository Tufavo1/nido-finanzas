import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { createNativeApiFetch, resolveApiBase } from './nativeApi'
import { ContigoNative, createPluginSecureBackend, isNativeApp } from './nativeBridge'
import { createSecureStorage } from './secureSession'
import { trackedFetch } from './trackedFetch'

/**
 * El navegador nunca habla directo con Supabase: todo pasa por «/supabase» de este mismo sitio
 * (un Worker de Cloudflare en producción, el proxy de Vite en desarrollo). La dirección real del
 * proyecto y la clave pública viven solo en el servidor; aquí va una clave de relleno que el proxy cambia.
 */
export const PROXY_PREFIX = '/supabase'
export const PLACEHOLDER_KEY = 'sb_publishable_via_proxy'

const native = isNativeApp()

/**
 * En la app nativa la dirección sale de VITE_API_BASE (DEC-01), la sesión vive en el Keystore (DEC-03) y las
 * peticiones salen por HTTP nativo CON el Origin del Worker (DEC-01 revisada). En la web sigue todo como antes.
 */
const apiBase = native ? resolveApiBase(import.meta.env.VITE_API_BASE, import.meta.env.PROD) : PROXY_PREFIX

function apiUrl(): string {
  return apiBase.startsWith('/') ? `${globalThis.location?.origin ?? 'http://localhost'}${apiBase}` : apiBase
}

export const supabase = createClient<Database>(apiUrl(), PLACEHOLDER_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'contigo-auth',
    ...(native ? { storage: createSecureStorage(createPluginSecureBackend(ContigoNative)) } : {}),
  },
  global: { fetch: native ? createNativeApiFetch(apiBase) : trackedFetch },
})
