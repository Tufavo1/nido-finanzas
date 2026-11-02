import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

/** ¿Esta sesión tiene que verificar el segundo factor antes de entrar? (la persona lo activó pero aún no lo escribió) */
export async function needsMfaChallenge(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
}

/** Revisa cada vez que cambia la sesión. `checking` es verdadero hasta saberlo, para no mostrar la app a medias. */
export function useMfaGate(userId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{ key: string | undefined; required: boolean } | null>(null)
  const check = useCallback(async () => {
    if (!userId) return
    const required = await needsMfaChallenge().catch(() => false)
    setState({ key: userId, required })
  }, [userId])
  useEffect(() => {
    if (enabled) void check()
  }, [check, enabled])
  // Al cerrar sesión se olvida el resultado: la próxima entrada vuelve a preguntar
  useEffect(() => {
    if (!userId) setState(null)
  }, [userId])
  const known = state !== null && state.key === userId
  return { checking: enabled && !!userId && !known, required: known && state.required, recheck: check }
}
