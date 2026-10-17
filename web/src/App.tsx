import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Tables } from './lib/database.types'
import AuthScreen from './screens/AuthScreen'
import Onboarding from './screens/Onboarding'
import Shell from './Shell'

export interface Household {
  household: Tables<'households'>
  members: Tables<'members'>[]
  me: Tables<'members'>
}

async function loadHousehold(userId: string): Promise<Household | null> {
  const { data: me, error } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!me) return null

  const [h, m] = await Promise.all([
    supabase.from('households').select('*').eq('id', me.household_id).single(),
    supabase.from('members').select('*').eq('household_id', me.household_id).order('joined_at'),
  ])
  if (h.error) throw h.error
  if (m.error) throw m.error
  return { household: h.data, members: m.data, me }
}

function Splash({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <div className="splash">
      <div className="logo" aria-hidden="true" />
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

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
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
  if (!session) return <AuthScreen />
  if (loadError) return <Splash text={loadError} onRetry={() => void reload()} />
  if (hh === undefined) return <Splash />
  if (hh === null) return <Onboarding onDone={reload} />
  return <Shell hh={hh} reload={reload} />
}
