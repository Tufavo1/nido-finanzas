import type { Alert } from './engine'

/** Avisos pospuestos o descartados por la persona. Se guarda en este dispositivo; un aviso vuelve solo cuando se cumple el plazo. */

const KEY = 'contigo-alert-snooze'
const DAY = 86_400_000

export type Snoozed = Record<string, number>

export function readSnoozed(now: number = Date.now()): Snoozed {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object') return {}
    const out: Snoozed = {}
    for (const [id, until] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof until === 'number' && until > now) out[id] = until
    }
    return out
  } catch {
    return {}
  }
}

/** Oculta el aviso `days` días. Devuelve el estado nuevo. */
export function snoozeAlert(id: string, days: number, now: number = Date.now()): Snoozed {
  const next = { ...readSnoozed(now), [id]: now + days * DAY }
  try {
    // Se guardan como mucho 200 para que no crezca sin límite
    const entries = Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, 200)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* sin almacenamiento: vale solo para esta sesión */
  }
  return next
}

export const isSnoozed = (id: string, snoozed: Snoozed, now: number = Date.now()): boolean => (snoozed[id] ?? 0) > now

export function withoutSnoozed(alerts: Alert[], snoozed: Snoozed, now: number = Date.now()): Alert[] {
  return alerts.filter((a) => !isSnoozed(a.id, snoozed, now))
}
