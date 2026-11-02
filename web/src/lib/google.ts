import { captchaToken } from './captcha'
import { LEGAL_VERSION } from './legal'
import { supabase } from './supabase'

/**
 * Entrar con Google sin salir de Contigo (Google Identity Services): el botón de Google entrega un token a esta página
 * y se lo pasamos a Supabase. La persona nunca ve la dirección de Supabase. El ID de cliente es público (no es un secreto).
 */
export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined

interface GsiConfig {
  client_id: string
  callback: (r: { credential?: string }) => void
  nonce: string
  ux_mode: 'popup'
  auto_select: false
  cancel_on_tap_outside: boolean
}
interface GsiButton {
  type: 'standard'
  theme: 'outline'
  size: 'large'
  text: 'signin_with' | 'signup_with' | 'continue_with'
  shape: 'pill'
  logo_alignment: 'left'
  width: number
  locale: 'es'
}
export interface Gsi {
  initialize: (c: GsiConfig) => void
  renderButton: (el: HTMLElement, o: GsiButton) => void
}

declare global {
  interface Window {
    google?: { accounts: { id: Gsi } }
  }
}

let script: Promise<Gsi> | null = null

/** Carga el script oficial de Google una sola vez */
export function loadGsi(): Promise<Gsi> {
  script ??= new Promise<Gsi>((resolve, reject) => {
    const fail = () => {
      script = null
      reject(new Error('No se pudo cargar Google'))
    }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => (window.google?.accounts.id ? resolve(window.google.accounts.id) : fail())
    s.onerror = fail
    document.head.appendChild(s)
  })
  return script
}

/** Un valor al azar de un solo uso: ata el token de Google a esta pantalla y evita que alguien reutilice uno robado */
export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const GOOGLE_ERROR = 'No pudimos entrar con Google. Vuelve a intentarlo o usa tu correo y contraseña.'

/** Quien entra con Google no pasa por «Crear cuenta»: se deja constancia de que vio los términos al pulsar el botón */
export async function markTermsAccepted(meta: Record<string, unknown> | undefined): Promise<void> {
  if (meta?.accepted_terms_at) return
  await supabase.auth.updateUser({ data: { accepted_terms_at: new Date().toISOString(), terms_version: LEGAL_VERSION } })
}

/** Cambia el token de Google por una sesión de la app. Devuelve un mensaje si falla. */
export async function signInWithGoogleToken(token: string, nonce: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token,
      nonce,
      options: { captchaToken: await captchaToken() },
    })
    if (error || !data.session) return GOOGLE_ERROR
    await markTermsAccepted(data.session.user.user_metadata)
    return null
  } catch (e) {
    console.error(e)
    return e instanceof Error && /robot|anti-bots/i.test(e.message) ? e.message : GOOGLE_ERROR
  }
}
