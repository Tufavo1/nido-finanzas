// Copyright (c) 2026 Dinovance
import { useCallback, useEffect, useRef, useState } from 'react'
import { createToastQueue } from './toastQueue'
import type { Toast, ToastAction, ToastKind as QueueKind } from './toastQueue'
import { haptic } from './haptics'

/** Tipos que usan las pantallas ('warn' se mantiene por compatibilidad con los avisos existentes) */
export type UiToastKind = 'success' | 'info' | 'warn' | 'error'
export interface NotifyAction {
  label: ToastAction['label']
  onAction: () => void
  /** Cuánto dura en pantalla; por defecto lo decide la cola (Deshacer del modo automático: 10 s) */
  durationMs?: number
}

const KIND: Record<UiToastKind, QueueKind> = { success: 'success', info: 'info', warn: 'warning', error: 'error' }

/** Sistema único de avisos: una cola, uno a la vez, con acción opcional (Deshacer / Reintentar). */
export function useToasts() {
  const queue = useRef(createToastQueue())
  const handlers = useRef(new Map<string, () => void>())
  // Copia del aviso visible: la cola cambia el objeto en su lugar, y React necesita uno nuevo para volver a dibujar
  const [toast, setToast] = useState<Toast | null>(null)
  const render = useCallback(() => {
    const v = queue.current.visible()
    setToast(v ? { ...v } : null)
  }, [])

  const expiresAt = toast?.expiresAt
  useEffect(() => {
    if (expiresAt === undefined) return
    const t = window.setTimeout(() => {
      queue.current.tick(Date.now())
      render()
    }, Math.max(0, expiresAt - Date.now()))
    return () => window.clearTimeout(t)
  }, [toast?.id, expiresAt, render])

  const notify = useCallback((text: string, kind: UiToastKind = 'success', action?: NotifyAction) => {
    const q = queue.current
    const id = q.push({ kind: KIND[kind], message: text, ...(action ? { action: { label: action.label, id: 'pending' } } : {}), ...(action?.durationMs ? { durationMs: action.durationMs } : {}) }, Date.now())
    if (action) handlers.current.set(id, action.onAction)
    if (kind === 'success' || kind === 'error') haptic(kind)
    render()
  }, [render])

  const dismiss = useCallback((id: string) => {
    queue.current.dismiss(id, Date.now())
    handlers.current.delete(id)
    render()
  }, [render])

  /** Ejecuta la acción del aviso (Deshacer / Reintentar) y lo cierra */
  const act = useCallback(
    (id: string) => {
      handlers.current.get(id)?.()
      dismiss(id)
    },
    [dismiss],
  )

  return { toast, notify, dismiss, act }
}
