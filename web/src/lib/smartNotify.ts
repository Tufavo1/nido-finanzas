import { compareAlerts } from './engine'
import type { Alert } from './engine'
import { plain } from './plain'

const SEEN = 'contigo-seen-alerts'
const LOG = 'contigo-notify-log'

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** De noche no se molesta */
const QUIET_FROM = 22
const QUIET_TO = 8
const DAILY_CAP = 1
/** Un aviso urgente que sigue sin resolverse se vuelve a recordar cada tanto */
const RENOTIFY_BAD_MS = 3 * DAY

export interface NotifyLog {
  id: string
  t: number
}
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

function readLog(): NotifyLog[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOG) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is NotifyLog => !!x && typeof (x as NotifyLog).id === 'string' && typeof (x as NotifyLog).t === 'number') : []
  } catch {
    return []
  }
}

export const isQuietHour = (now: Date): boolean => now.getHours() >= QUIET_FROM || now.getHours() < QUIET_TO

/**
 * Qué avisos notificar ahora: solo urgentes y de cuidado, lo más importante primero, sin molestar de noche,
 * con tope diario y sin repetir. Un aviso urgente que sigue pendiente se recuerda cada 3 días.
 */
export function pickToNotify(alerts: Alert[], log: NotifyLog[], legacySeen: string[], now: Date = new Date()): Alert[] {
  if (isQuietHour(now)) return []
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const left = DAILY_CAP - log.filter((l) => l.t >= startOfDay).length
  if (left <= 0) return []
  const last = new Map<string, number>()
  for (const l of log) last.set(l.id, Math.max(last.get(l.id) ?? 0, l.t))
  const legacy = new Set(legacySeen)
  return [...alerts]
    .filter((a) => a.level === 'bad' || a.level === 'warn')
    .filter((a) => {
      const t = last.get(a.id)
      if (t === undefined) return !legacy.has(a.id)
      return a.level === 'bad' && now.getTime() - t >= RENOTIFY_BAD_MS
    })
    .sort(compareAlerts)
    .slice(0, left)
}

/** Alertas importantes todavía no avisadas por notificación (máximo 3 por vez) */
export function pickUnseen(alerts: Alert[], seen: string[]): Alert[] {
  const known = new Set(seen)
  return alerts.filter((a) => (a.level === 'bad' || a.level === 'warn') && !known.has(a.id)).slice(0, 3)
}

/** Muestra un aviso del sistema por cada alerta nueva importante. Funciona con la app abierta. */
export async function notifyNewAlerts(alerts: Alert[], now: Date = new Date()): Promise<number> {
  if (!smartNotifyEnabled() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return 0
  const log = readLog()
  const fresh = pickToNotify(alerts, log, readSeen(), now)
  if (fresh.length === 0) return 0
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null
    for (const a of fresh) {
      const opts = { body: plain(a.detail), icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: a.id }
      if (reg) await reg.showNotification(plain(a.title), opts)
      else new Notification(plain(a.title), opts)
    }
    const cutoff = now.getTime() - 30 * DAY
    const next = [...log, ...fresh.map((a) => ({ id: a.id, t: now.getTime() }))].filter((l) => l.t >= cutoff).slice(-300)
    localStorage.setItem(LOG, JSON.stringify(next))
  } catch {
    return 0
  }
  return fresh.length
}
