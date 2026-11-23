// Copyright (c) 2026 Dinovance
// Cola única de avisos (toasts): uno visible a la vez, el resto espera. Pura: el tiempo llega como parámetro.

export type ToastKind = 'success' | 'error' | 'warning' | 'info'
export interface ToastAction {
  label: 'Deshacer' | 'Reintentar'
  /** Identificador de la accion que el llamador conoce */
  id: string
}
export interface ToastInput {
  kind: ToastKind
  message: string
  action?: ToastAction
  durationMs?: number
}
export interface Toast {
  id: string
  kind: ToastKind
  message: string
  action?: ToastAction
  /** error -> 'alert'; el resto -> 'status' */
  role: 'alert' | 'status'
  /** Momento (ms) en que deja de mostrarse; solo vale para el que esta visible */
  expiresAt: number
}

export interface ToastQueue {
  push(t: ToastInput, now: number): string
  /** Avanza el tiempo: retira lo vencido y muestra el siguiente */
  tick(now: number): void
  dismiss(id: string, now: number): void
  visible(): Toast | null
  queued(): Toast[]
}

const BASE_MS: Record<ToastKind, number> = { success: 4_000, info: 5_000, warning: 6_000, error: 8_000 }
/** Quien toca una acción necesita tiempo para leerla y decidir */
const ACTION_EXTRA_MS = 2_000

interface Entry {
  toast: Toast
  ms: number
}

function entryOf(id: string, t: ToastInput): Entry {
  const ms = t.durationMs ?? BASE_MS[t.kind] + (t.action ? ACTION_EXTRA_MS : 0)
  const toast: Toast = { id, kind: t.kind, message: t.message, role: t.kind === 'error' ? 'alert' : 'status', expiresAt: 0 }
  if (t.action) toast.action = t.action
  return { toast, ms }
}

export function createToastQueue(): ToastQueue {
  let seq = 0
  let current: Entry | null = null
  const waiting: Entry[] = []

  const show = (e: Entry, now: number) => {
    e.toast.expiresAt = now + e.ms
    current = e
  }
  const next = (now: number) => {
    const e = waiting.shift()
    if (e) show(e, now)
    else current = null
  }
  const same = (e: Entry, t: ToastInput) => e.toast.kind === t.kind && e.toast.message === t.message

  const tick = (now: number) => {
    while (current && now >= current.toast.expiresAt) next(now)
  }

  return {
    push(t, now) {
      tick(now)
      if (current && same(current, t)) {
        current.toast.expiresAt = now + current.ms
        return current.toast.id
      }
      const dup = waiting.find((e) => same(e, t))
      if (dup) return dup.toast.id
      seq += 1
      const e = entryOf(`toast-${seq}`, t)
      if (current) waiting.push(e)
      else show(e, now)
      return e.toast.id
    },
    tick,
    dismiss(id, now) {
      if (current?.toast.id === id) {
        next(now)
        return
      }
      const i = waiting.findIndex((e) => e.toast.id === id)
      if (i >= 0) waiting.splice(i, 1)
    },
    visible: () => current?.toast ?? null,
    queued: () => waiting.map((e) => e.toast),
  }
}
