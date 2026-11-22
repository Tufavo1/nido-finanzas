// Copyright (c) 2026 Dinovance
// Entrar con Google en la app nativa con Credential Manager (Sign in with Google). Google BLOQUEA el flujo OAuth web dentro de una
// WebView (disallowed_useragent), así que en la app nunca se abre ese camino: el selector de cuentas es del sistema.
import { ContigoNative, isNativeApp } from './nativeBridge'
import { GOOGLE_CLIENT_ID, GOOGLE_ERROR, randomNonce, signInWithGoogleToken } from './google'

export type GoogleErrorCode = 'CANCELLED' | 'NO_ACCOUNTS' | 'NETWORK' | 'INVALID_NONCE' | 'UNSUPPORTED' | 'SERVER_REJECTED' | 'FAILED'

const MESSAGES: Record<GoogleErrorCode, string> = {
  CANCELLED: 'Cancelaste el inicio de sesión con Google.',
  NO_ACCOUNTS: 'No encontramos una cuenta de Google en este teléfono. Agrega una en Ajustes o usa tu correo y contraseña.',
  NETWORK: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  INVALID_NONCE: 'No pudimos asegurar el inicio de sesión. Inténtalo de nuevo.',
  UNSUPPORTED: 'Este teléfono no permite entrar con Google. Usa tu correo y contraseña.',
  SERVER_REJECTED: 'Google respondió, pero Contigo no pudo validar tu cuenta. Inténtalo de nuevo o usa tu correo y contraseña.',
  FAILED: 'No pudimos entrar con Google. Vuelve a intentarlo o usa tu correo y contraseña.',
}

export const googleErrorMessage = (code: GoogleErrorCode): string => MESSAGES[code]

const KNOWN = new Set<string>(['CANCELLED', 'NO_ACCOUNTS', 'NETWORK', 'INVALID_NONCE', 'UNSUPPORTED'])

/** Código tipado que manda el plugin (error.code de Capacitor). Todo lo demás es FAILED; el texto del error no se usa. */
export function googleErrorCode(e: unknown): GoogleErrorCode {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined
  return typeof code === 'string' && KNOWN.has(code) ? (code as GoogleErrorCode) : 'FAILED'
}

export interface GoogleDeps {
  /** ID de cliente WEB (público, VITE_GOOGLE_CLIENT_ID): es el serverClientId del selector */
  clientId: string | undefined
  isSupported(): Promise<boolean>
  makeNonce(): string
  /** El plugin hashea el nonce (SHA-256 hex) para el selector y devuelve el token de Google */
  requestIdToken(nonce: string, serverClientId: string): Promise<string>
  /** supabase.auth.signInWithIdToken con el nonce EN CLARO; devuelve un mensaje si falla */
  exchange(idToken: string, nonce: string): Promise<string | null>
}

export async function googleSignInAvailable(d: Pick<GoogleDeps, 'clientId' | 'isSupported'>): Promise<boolean> {
  if (!d.clientId) return false
  try {
    return await d.isSupported()
  } catch {
    return false
  }
}

/** null = sesión iniciada; si no, el mensaje (en español simple) para la persona. Nunca registra tokens ni correos. */
export async function runNativeGoogleSignIn(d: GoogleDeps): Promise<string | null> {
  if (!(await googleSignInAvailable(d)) || !d.clientId) return MESSAGES.UNSUPPORTED
  const nonce = d.makeNonce()
  let idToken: string
  try {
    idToken = await d.requestIdToken(nonce, d.clientId)
  } catch (e) {
    return MESSAGES[googleErrorCode(e)]
  }
  if (!idToken) return MESSAGES.FAILED
  const err = await d.exchange(idToken, nonce)
  if (err === null) return null
  // El aviso del captcha es útil tal cual; cualquier otro rechazo del servidor tiene mensaje propio
  return /robot|anti-bots/i.test(err) ? err : err === GOOGLE_ERROR ? MESSAGES.SERVER_REJECTED : err
}

export const nativeGoogleDeps: GoogleDeps = {
  clientId: GOOGLE_CLIENT_ID,
  isSupported: async () => isNativeApp() && (await ContigoNative.isGoogleSignInSupported()).supported === true,
  makeNonce: randomNonce,
  requestIdToken: async (nonce, serverClientId) => (await ContigoNative.googleSignIn({ nonce, serverClientId })).idToken,
  exchange: signInWithGoogleToken,
}

export const signInWithGoogleNative = (): Promise<string | null> => runNativeGoogleSignIn(nativeGoogleDeps)
export const nativeGoogleAvailable = (): Promise<boolean> => googleSignInAvailable(nativeGoogleDeps)
