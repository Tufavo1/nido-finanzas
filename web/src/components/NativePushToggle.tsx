// Copyright (c) 2026 Dinovance
import { useEffect, useState } from 'react'
import { nativeCopy, parsePushStatus } from '../lib/appUpdate'
import type { NativePushStatus } from '../lib/appUpdate'
import { ContigoNative } from '../lib/nativeBridge'
import { logError } from '../lib/safeLog'
import { SkeletonCard } from './Skeleton'
import Spin from './Spin'
import type { Notify } from './Toast'

/** Notificaciones en la app Android: permiso del sistema y registro del token FCM (nada de Web Push) */
export default function NativePushToggle({ onToast }: { onToast: Notify }) {
  const [st, setSt] = useState<NativePushStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ContigoNative.getPushStatus()
      .then((r) => alive && setSt(parsePushStatus(r)))
      .catch((e: unknown) => {
        logError(e, 'NativePushToggle')
        if (alive) setSt(parsePushStatus(null))
      })
    return () => {
      alive = false
    }
  }, [])

  const on = st?.permission === 'granted' && st.tokenRegistered
  const denied = st?.permission === 'denied'

  async function toggle() {
    setBusy(true)
    try {
      if (on) {
        await ContigoNative.disablePush()
        setSt(parsePushStatus({ permission: 'granted', tokenRegistered: false }))
      } else {
        setSt(parsePushStatus(await ContigoNative.enablePush()))
      }
    } catch (e) {
      logError(e, 'NativePushToggle')
      onToast('No se pudo cambiar\nInténtalo de nuevo en un momento.', 'error')
    }
    setBusy(false)
  }

  if (!st) return <SkeletonCard lines={1} label="Cargando los avisos…" />

  return (
    <section className="card" id="avisos">
      <div className="stack tight">
        <div className="row between">
          <span className="grow">Avisos de la app y de tu pareja</span>
          {busy ? (
            <Spin label="Un momento…" />
          ) : denied ? (
            <button type="button" className="btn ghost small" onClick={() => void ContigoNative.openAppDetails().catch(() => undefined)}>
              Abrir ajustes
            </button>
          ) : (
            <button type="button" className="switch" role="switch" aria-checked={on} aria-label="Avisos de la app y de tu pareja" onClick={() => void toggle()} />
          )}
        </div>
        <span className="muted small-text">{denied ? nativeCopy.notifyBlocked : nativeCopy.notifyHint}</span>
      </div>
    </section>
  )
}
