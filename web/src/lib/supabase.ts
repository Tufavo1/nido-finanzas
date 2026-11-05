import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { trackedFetch } from './trackedFetch'

/**
 * El navegador nunca habla directo con Supabase: todo pasa por «/supabase» de este mismo sitio
 * (un Worker de Cloudflare en producción, el proxy de Vite en desarrollo). La dirección real del
 * proyecto y la clave pública viven solo en el servidor; aquí va una clave de relleno que el proxy cambia.
 */
export const PROXY_PREFIX = '/supabase'
export const PLACEHOLDER_KEY = 'sb_publishable_via_proxy'

export const supabase = createClient<Database>(`${globalThis.location?.origin ?? 'http://localhost'}${PROXY_PREFIX}`, PLACEHOLDER_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'contigo-auth' },
  global: { fetch: trackedFetch },
})
