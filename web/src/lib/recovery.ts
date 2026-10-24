import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type RecoveryResult = 'none' | 'ready' | 'invalid'

/**
 * Si la página se abrió desde el correo de olvidé mi contraseña, convierte el enlace en una sesión
 * de recuperación. Entiende los tres formatos que usa Supabase (token_hash, code y #access_token) y
 * después borra los datos de la dirección para que el enlace no quede en el historial.
 */
export async function consumeRecoveryLink(): Promise<RecoveryResult> {
  const url = new URL(window.location.href)
  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const type = query.get('type') ?? hash.get('type')
  const tokenHash = query.get('token_hash')
  const code = query.get('code')
  const hashError = hash.get('error_code') ?? query.get('error_code')
  const hashToken = hash.get('access_token')
  const hashRefresh = hash.get('refresh_token')

  const looksLikeRecovery = type === 'recovery' || Boolean(code) || Boolean(hashError)
  if (!looksLikeRecovery) return 'none'

  const clean = () => window.history.replaceState(null, '', url.pathname)
  if (hashError) {
    clean()
    return 'invalid'
  }

  let ok = false
  try {
    if (tokenHash && type === 'recovery') {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' as EmailOtpType })
      ok = !error
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      ok = !error
    } else if (hashToken && hashRefresh) {
      const { error } = await supabase.auth.setSession({ access_token: hashToken, refresh_token: hashRefresh })
      ok = !error
    }
  } catch (e) {
    console.error(e)
  }
  clean()
  return ok ? 'ready' : 'invalid'
}
