import { wipeSessionData } from './lib/wipe'
import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Tables } from './lib/database.types'
import Logo from './components/Logo'
import Shell from './Shell'
import { consumeRecoveryLink } from './lib/recovery'

const AuthScreen = lazy(() => import('./screens/AuthScreen'))
const Onboarding = lazy(() => import('./screens/Onboarding'))
const ResetPassword = lazy(() => import('./screens/ResetPassword'))

export interface Household {
  household: Tables<'households'>
  /** Personas activas del hogar (1 o 2) */
  members: Tables<'members'>[]
  /** Activas y ex-miembros: solo para mostrar nombres en el historial */
  everyone: Tables<'members'>[]
  me: Tables<'members'>
}

async function loadHousehold(userId: string): Promise<Household | null> {
  const { data: me, error } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle()
  if (error) throw error
  if (!me) return null

  const [h, m] = await Promise.all([
    supabase.from('households').select('*').eq('id', me.household_id).single(),
    supabase.from('members').select('*').eq('household_id', me.household_id).order('joined_at'),
  ])
  if (h.error) throw h.error
  if (m.error) throw m.error
  return { household: h.data, members: m.data.filter((x) => !x.left_at), everyone: m.data, me }
}

function Splash({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <div className="splash">
      <Logo size={56} pulse />
      {text && <p className="muted">{text}</p>}
      {onRetry && (
        <button className="btn" type="button" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [hh, setHh] = useState<Household | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Entró desde el correo de recuperación: debe elegir su contraseña nueva antes de usar la app
  const [recovering, setRecovering] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') wipeSessionData()
      setSession(s)
    })
    void consumeRecoveryLink().then(async (r) => {
      if (r === 'ready') setRecovering(true)
      if (r === 'invalid') setAuthNotice('El enlace del correo venció o ya se usó. Pide uno nuevo con la opción Olvidé mi contraseña.')
      const { data: cur } = await supabase.auth.getSession()
      setSession(cur.session)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const reload = useCallback(async () => {
    if (!userId) return
    try {
      setLoadError(null)
      setHh(await loadHousehold(userId))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'No se pudo cargar el hogar')
    }
  }, [userId])

  useEffect(() => {
    setHh(undefined)
    void reload()
  }, [reload])

  if (session === undefined) return <Splash />
  if (!session)
    return (
      <Suspense fallback={<Splash />}>
        <AuthScreen notice={authNotice} />
      </Suspense>
    )
  if (recovering)
    return (
      <Suspense fallback={<Splash />}>
        <ResetPassword onDone={() => setRecovering(false)} />
      </Suspense>
    )
  if (loadError) return <Splash text={loadError} onRetry={() => void reload()} />
  if (hh === undefined) return <Splash />
  if (hh === null)
    return (
      <Suspense fallback={<Splash />}>
        <Onboarding onDone={reload} />
      </Suspense>
    )
  return <Shell hh={hh} reload={reload} />
}
