import { wipeSessionData } from './lib/wipe'
import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Tables } from './lib/database.types'
import Logo from './components/Logo'
import ErrorPage from './components/ErrorPage'
import Shell from './Shell'
import { consumeOAuthCallback } from './lib/oauth'
import { consumeRecoveryLink } from './lib/recovery'
import { hasPassword, usesGoogle } from './lib/account'
import { useMfaGate } from './lib/mfa'

const AuthScreen = lazy(() => import('./screens/AuthScreen'))
const Onboarding = lazy(() => import('./screens/Onboarding'))
const ResetPassword = lazy(() => import('./screens/ResetPassword'))
const MfaChallenge = lazy(() => import('./screens/MfaChallenge'))
const SetupPassword = lazy(() => import('./screens/SetupPassword'))

export interface Household {
  household: Tables<'households'>
  /** Personas activas del hogar (1 o 2) */
  members: Tables<'members'>[]
  /** Activas y ex-miembros: solo para mostrar nombres en el historial */
  everyone: Tables<'members'>[]
  me: Tables<'members'>
}

/** Falla al cargar el hogar, con el código de la respuesta (0 = sin conexión) */
class LoadError extends Error {
  status: number
  constructor(status: number) {
    super('No se pudo cargar el hogar')
    this.status = status
  }
}

async function loadHousehold(userId: string): Promise<Household | null> {
  const { data: me, error, status } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle()
  if (error) throw new LoadError(status)
  if (!me) return null

  const [h, m] = await Promise.all([
    supabase.from('households').select('*').eq('id', me.household_id).single(),
    supabase.from('members').select('*').eq('household_id', me.household_id).order('joined_at'),
  ])
  if (h.error) throw new LoadError(h.status)
  if (m.error) throw new LoadError(m.status)
  return { household: h.data, members: m.data.filter((x) => !x.left_at), everyone: m.data, me }
}

function Splash() {
  return (
    <div className="splash">
      <Logo size={56} pulse />
    </div>
  )
}

/** Solo en desarrollo: «/?error=403» muestra la pantalla de ese error para revisarla */
function previewStatus(): number | null {
  if (!import.meta.env.DEV) return null
  const v = new URLSearchParams(location.search).get('error')
  return v !== null && /^\d{1,3}$/.test(v) ? Number(v) : null
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [hh, setHh] = useState<Household | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<number | null>(null)

  // Entró desde el correo de recuperación: debe elegir su contraseña nueva antes de usar la app
  const [recovering, setRecovering] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') wipeSessionData()
      setSession(s)
    })
    void (async () => {
      const g = await consumeOAuthCallback()
      if (g === 'failed') setAuthNotice('No pudimos entrar con Google. Vuelve a intentarlo o usa tu correo y contraseña.')
      return g === 'none' ? consumeRecoveryLink() : 'none'
    })().then(async (r) => {
      if (r === 'ready') setRecovering(true)
      if (r === 'invalid') setAuthNotice('El enlace del correo venció o ya se usó. Pide uno nuevo con la opción Olvidé mi contraseña.')
      const { data: cur } = await supabase.auth.getSession()
      setSession(cur.session)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const mfa = useMfaGate(userId, !recovering)

  const reload = useCallback(async () => {
    if (!userId) return
    try {
      setLoadError(null)
      setHh(await loadHousehold(userId))
    } catch (e) {
      setLoadError(e instanceof LoadError ? e.status : 0)
    }
  }, [userId])

  useEffect(() => {
    setHh(undefined)
    void reload()
  }, [reload])

  const preview = previewStatus()
  if (preview !== null) return <ErrorPage status={preview} onRetry={() => location.reload()} onExit={() => location.assign('/')} />
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
  // Activó la verificación en dos pasos: sin el código no se ve nada
  if (!recovering && mfa.checking) return <Splash />
  if (mfa.required)
    return (
      <Suspense fallback={<Splash />}>
        <MfaChallenge onVerified={() => void mfa.recheck()} />
      </Suspense>
    )
  // Entró con Google y aún no tiene contraseña: paso 1 de 2, antes de crear el hogar
  if (!hasPassword(session.user)) {
    const full = session.user.user_metadata?.full_name
    return (
      <Suspense fallback={<Splash />}>
        <SetupPassword name={typeof full === 'string' ? full.trim().split(/\s+/)[0] : undefined} />
      </Suspense>
    )
  }
  if (loadError !== null)
    return (
      <ErrorPage
        status={loadError}
        onRetry={() => void reload()}
        onExit={() => void supabase.auth.signOut()}
        exitLabel="Cerrar sesión"
      />
    )
  if (hh === undefined) return <Splash />
  if (hh === null)
    return (
      <Suspense fallback={<Splash />}>
        <Onboarding onDone={reload} step={usesGoogle(session.user) ? 'Paso 2 de 2' : undefined} />
      </Suspense>
    )
  return <Shell hh={hh} reload={reload} />
}
