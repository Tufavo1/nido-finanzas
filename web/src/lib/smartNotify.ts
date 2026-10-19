import type { Alert } from './engine'

const SEEN = 'contigo-seen-alerts'
const PREF = 'contigo-smart-notify'

export function smartNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(PREF) !== 'off'
  } catch {
    return true
  }
}

export function setSmartNotify(on: boolean): void {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off')
  } catch {
    /* sin almacenamiento: vale solo para esta sesión */
  }
}

function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Alertas importantes todavía no avisadas por notificación (máximo 3 por vez) */
export function pickUnseen(alerts: Alert[], seen: string[]): Alert[] {
  const known = new Set(seen)
  return alerts.filter((a) => (a.level === 'bad' || a.level === 'warn') && !known.has(a.id)).slice(0, 3)
}

/** Muestra un aviso del sistema por cada alerta nueva importante. Funciona con la app abierta. */
export async function notifyNewAlerts(alerts: Alert[]): Promise<number> {
  if (!smartNotifyEnabled() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return 0
  const seen = readSeen()
  const fresh = pickUnseen(alerts, seen)
  if (fresh.length === 0) return 0
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null
    for (const a of fresh) {
      const opts = { body: a.detail, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: a.id }
      if (reg) await reg.showNotification(a.title, opts)
      else new Notification(a.title, opts)
    }
    localStorage.setItem(SEEN, JSON.stringify([...seen, ...fresh.map((a) => a.id)].slice(-300)))
  } catch {
    return 0
  }
  return fresh.length
}
