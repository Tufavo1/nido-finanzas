// Copyright (c) 2026 Dinovance
import { useCallback, useEffect, useState } from 'react'
import { fetchSecurityOverview } from './securityPanel'
import type { SecurityOverview } from './securityPanel'
import { logError } from './safeLog'

export type OverviewState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: SecurityOverview }

const LOADING: OverviewState = { status: 'loading' }

/** Carga el resumen de seguridad de las últimas `hours` horas. Solo lectura. */
export function useSecurityOverview(hours: number): { state: OverviewState; reload: () => void } {
  const [tick, setTick] = useState(0)
  // El resultado lleva la consulta a la que responde: si cambia el período o se recarga, mientras tanto se ve «cargando»
  const key = `${hours}:${tick}`
  const [result, setResult] = useState<{ key: string; state: OverviewState }>({ key: '', state: LOADING })

  useEffect(() => {
    let cancelled = false
    fetchSecurityOverview(hours)
      .then((data) => !cancelled && setResult({ key, state: { status: 'ready', data } }))
      .catch((e: unknown) => {
        logError(e, 'useSecurityOverview')
        if (!cancelled) setResult({ key, state: { status: 'error' } })
      })
    return () => {
      cancelled = true
    }
  }, [hours, key])

  return { state: result.key === key ? result.state : LOADING, reload: useCallback(() => setTick((t) => t + 1), []) }
}
