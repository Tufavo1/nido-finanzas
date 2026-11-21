// Copyright (c) 2026 Dinovance
import { useCallback, useEffect, useState } from 'react'
import { ContigoNative, isNativeApp } from './nativeBridge'
import type { CaptureStatus } from './nativeBridge'
import { useAppResume } from './useAppResume'
import { logError } from './safeLog'

export type StatusState = { kind: 'web' } | { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; status: CaptureStatus }

/** Estado de la captura en el teléfono; se vuelve a leer al volver de los ajustes del sistema. */
export function useCaptureStatus(): { state: StatusState; reload: () => Promise<void> } {
  const native = isNativeApp()
  const [state, setState] = useState<StatusState>(native ? { kind: 'loading' } : { kind: 'web' })

  const reload = useCallback(async () => {
    if (!native) return
    try {
      setState({ kind: 'ready', status: await ContigoNative.getStatus() })
    } catch (e) {
      logError(e, 'useCaptureStatus')
      setState({ kind: 'error' })
    }
  }, [native])

  useEffect(() => {
    const t = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(t)
  }, [reload])
  useAppResume(() => void reload())
  return { state, reload }
}
