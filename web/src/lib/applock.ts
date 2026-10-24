/** Bloqueo por inactividad: tapa la app y pide la contraseña de la cuenta. Es una barrera de privacidad en este dispositivo. */

export const LOCK_OPTIONS = [
  { minutes: 0, label: 'Nunca' },
  { minutes: 1, label: '1 min' },
  { minutes: 5, label: '5 min' },
  { minutes: 15, label: '15 min' },
] as const

const PREF = 'contigo-lock-min'
const LAST = 'contigo-last-active'
const LOCKED = 'contigo-locked'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // sin almacenamiento: el bloqueo queda solo en memoria
  }
}

export function getLockMinutes(): number {
  const n = Number(read(PREF))
  return LOCK_OPTIONS.some((o) => o.minutes === n) ? n : 0
}
export function setLockMinutes(minutes: number): void {
  write(PREF, minutes > 0 ? String(minutes) : null)
  if (minutes === 0) write(LOCKED, null)
  touch()
}

export const touch = (now: number = Date.now()): void => write(LAST, String(now))
export const isFlaggedLocked = (): boolean => read(LOCKED) === '1'
export const setFlaggedLocked = (v: boolean): void => write(LOCKED, v ? '1' : null)

/** ¿Pasó más tiempo del permitido desde la última actividad? Con el bloqueo apagado, nunca. */
export function shouldLock(minutes: number, lastActive: number, now: number = Date.now()): boolean {
  if (minutes <= 0) return false
  return now - lastActive >= minutes * 60_000
}

export function lastActive(): number {
  const n = Number(read(LAST))
  return Number.isFinite(n) && n > 0 ? n : Date.now()
}
