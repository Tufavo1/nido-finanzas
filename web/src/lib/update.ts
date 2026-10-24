import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

// Versiones nuevas de la app: el service worker las descarga en segundo plano, pero solo se
// activan cuando la persona acepta (así una actualización no recarga la página a mitad de un formulario).

let waiting = false
let apply: ((reload?: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function startUpdateWatcher(): void {
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true
      emit()
    },
  })
}

/** Activa la versión nueva y recarga la página */
export async function applyUpdate(): Promise<void> {
  await apply?.(true)
}

export function useUpdateWaiting(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => waiting,
    () => false,
  )
}
