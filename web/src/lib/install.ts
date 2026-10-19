import { useSyncExternalStore } from 'react'

// Instalación como app (PWA). Chrome, Edge y Android avisan con `beforeinstallprompt`, un evento
// que solo llega una vez y muy temprano: por eso se captura al arrancar (ver main.tsx).
// iPhone/iPad no lo tienen: se instala a mano desde Compartir → Añadir a pantalla de inicio.

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** installed: ya es app · available: se puede instalar con un toque · ios: instalación manual · unavailable: este navegador no instala */
export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable'

const DISMISS_KEY = 'contigo-install-dismissed'
const SNOOZE_DAYS = 14

let deferred: InstallEvent | null = null
let justInstalled = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ se presenta como Mac con pantalla táctil
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export function startInstallWatcher(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // el aviso lo mostramos nosotros, con nuestro texto y en el momento oportuno
    deferred = e as InstallEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    justInstalled = true
    emit()
  })
}

export function installState(): InstallState {
  if (justInstalled || isStandalone()) return 'installed'
  if (deferred) return 'available'
  if (isIos()) return 'ios'
  return 'unavailable'
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

export const useInstallState = (): InstallState => useSyncExternalStore(subscribe, installState, () => 'unavailable')

/** Muestra el diálogo del navegador. Devuelve true si la persona aceptó. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const ev = deferred
  deferred = null // el evento solo sirve una vez
  emit()
  await ev.prompt()
  const { outcome } = await ev.userChoice
  return outcome === 'accepted'
}

export function snoozeInstallPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // sin almacenamiento: volverá a preguntar en la próxima visita, no es grave
  }
}

export function installPromptSnoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return at > 0 && Date.now() - at < SNOOZE_DAYS * 86_400_000
  } catch {
    return false
  }
}
