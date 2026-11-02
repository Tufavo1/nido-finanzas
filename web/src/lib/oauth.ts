import { createClient } from '@supabase/supabase-js'
import { markTermsAccepted } from './google'
import { PLACEHOLDER_KEY, PROXY_PREFIX, supabase } from './supabase'

/**
 * Entrar con Google. El cliente principal usa el flujo con tokens en la dirección (necesario para los correos de
 * recuperación, que se abren a veces en otro navegador). Google, en cambio, usa PKCE: el código que vuelve en la dirección
 * solo sirve en este navegador. Por eso hay un segundo cliente, solo para esto, que se desecha apenas termina.
 */
const OAUTH_KEY = 'contigo-oauth'

const oauth = createClient(`${globalThis.location?.origin ?? 'http://localhost'}${PROXY_PREFIX}`, PLACEHOLDER_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: OAUTH_KEY },
})

/** Manda a la persona a Google. Si algo falla antes de salir, devuelve el mensaje. */
export async function signInWithGoogle(): Promise<string | null> {
  const { error } = await oauth.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
  })
  return error ? 'No se pudo abrir Google. Revisa tu conexión e intenta de nuevo.' : null
}

export type OAuthResult = 'none' | 'ready' | 'failed'

const verifierKey = `${OAUTH_KEY}-code-verifier`
const hasVerifier = (): boolean => {
  try {
    return localStorage.getItem(verifierKey) !== null
  } catch {
    return false
  }
}
const forget = () => {
  try {
    localStorage.removeItem(OAUTH_KEY)
    localStorage.removeItem(verifierKey)
  } catch {
    // sin almacenamiento: no hay nada que limpiar
  }
}

/**
 * Si la página se abrió al volver de Google, convierte el código en una sesión de la app.
 * Solo actúa si este navegador inició el proceso (existe el verificador): un código ajeno no sirve de nada.
 */
export async function consumeOAuthCallback(): Promise<OAuthResult> {
  if (!hasVerifier()) return 'none'
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const code = url.searchParams.get('code')
  const failed = url.searchParams.get('error') ?? hash.get('error')
  if (!code && !failed) return 'none'

  const clean = () => window.history.replaceState(null, '', url.pathname)
  if (failed || !code) {
    clean()
    forget()
    return 'failed'
  }
  try {
    const { data, error } = await oauth.auth.exchangeCodeForSession(code)
    if (error || !data.session) throw error ?? new Error('sin sesión')
    const { access_token, refresh_token } = data.session
    const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token })
    if (setErr) throw setErr
    // Quien entra con Google no pasa por «Crear cuenta»: se deja constancia de que vio los términos al pulsar el botón
    await markTermsAccepted(data.session.user.user_metadata)
    return 'ready'
  } catch (e) {
    console.error(e)
    return 'failed'
  } finally {
    clean()
    // La sesión ya vive en el cliente principal; la copia de este cliente se borra sin cerrar la sesión en el servidor
    forget()
  }
}
