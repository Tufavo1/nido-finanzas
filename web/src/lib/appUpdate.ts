// Copyright (c) 2026 Dinovance
/** Lógica pura de la app Android: actualizaciones, versión y avisos nativos. Sin DOM ni plugin: se prueba sola. */

export const CHECK_EVERY_MS = 12 * 3_600_000

/** Máximo una revisión cada 12 h; un reloj raro (revisión en el futuro) cuenta como «toca revisar» */
export function shouldCheck(lastAt: number | null, now: number): boolean {
  if (lastAt === null || !Number.isFinite(lastAt) || lastAt > now) return true
  return now - lastAt >= CHECK_EVERY_MS
}

export interface UpdateInfo {
  available: boolean
  versionName?: string
  notes?: string
  sizeBytes?: number
}

export interface AppInfo {
  versionName: string
  versionCode: number
}

export interface NativePushStatus {
  permission: 'granted' | 'denied' | 'default'
  tokenRegistered: boolean
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function parseUpdateInfo(raw: unknown): UpdateInfo {
  if (!isObj(raw) || raw.available !== true || typeof raw.versionName !== 'string' || !raw.versionName) return { available: false }
  const out: UpdateInfo = { available: true, versionName: raw.versionName }
  if (typeof raw.notes === 'string' && raw.notes) out.notes = raw.notes
  if (typeof raw.sizeBytes === 'number' && Number.isFinite(raw.sizeBytes) && raw.sizeBytes > 0) out.sizeBytes = raw.sizeBytes
  return out
}

export function parseAppInfo(raw: unknown): AppInfo | null {
  if (!isObj(raw) || typeof raw.versionName !== 'string' || !raw.versionName) return null
  const code = Number(raw.versionCode)
  if (!Number.isInteger(code) || code < 0) return null
  return { versionName: raw.versionName, versionCode: code }
}

export function parsePushStatus(raw: unknown): NativePushStatus {
  const r = isObj(raw) ? raw : {}
  const p = r.permission
  return { permission: p === 'granted' || p === 'denied' ? p : 'default', tokenRegistered: r.tokenRegistered === true }
}

/** «Más tarde» se recuerda por versión: solo vuelve a avisar cuando sale otra distinta. El botón manual siempre muestra. */
export function shouldPrompt(info: UpdateInfo, dismissedVersion: string | null, manual = false): boolean {
  if (!info.available) return false
  return manual || info.versionName !== dismissedVersion
}

export function progressPercent(done: number, total: number | undefined): number | null {
  if (!total || total <= 0 || !Number.isFinite(done)) return null
  return Math.round(Math.min(100, Math.max(0, (done / total) * 100)))
}

export function formatBytes(n: number | undefined): string {
  if (!n || n <= 0) return ''
  if (n < 1_000_000) return `${n < 1000 ? n : Math.round(n / 1000)} ${n < 1000 ? 'B' : 'KB'}`
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')} MB`
}

export interface UpdateErrorInfo {
  kind: 'permission' | 'retry'
  text: string
}

/** Cualquier fallo del plugin, en una frase simple. Nunca se muestran códigos ni mensajes crudos. */
export function updateErrorInfo(e: unknown): UpdateErrorInfo {
  const code = isObj(e) && typeof e.code === 'string' ? e.code : ''
  if (code === 'NEEDS_INSTALL_PERMISSION')
    return { kind: 'permission', text: 'Falta un permiso para instalar la actualización. Actívalo en Ajustes para Contigo y vuelve aquí.' }
  if (code === 'NETWORK') return { kind: 'retry', text: 'No hay buena conexión. Revisa tu internet e inténtalo de nuevo.' }
  if (code === 'NO_SPACE') return { kind: 'retry', text: 'No hay espacio suficiente en el teléfono. Libera un poco e inténtalo de nuevo.' }
  if (code === 'CORRUPT') return { kind: 'retry', text: 'La descarga llegó dañada. Inténtalo de nuevo.' }
  return { kind: 'retry', text: 'No se pudo actualizar. Inténtalo de nuevo en un momento.' }
}

/** Textos de la app Android que reemplazan a los de la versión web */
export const nativeCopy = {
  appKind: 'Aplicación Android',
  accessTitle: 'Conexión y avisos',
  accessSummary: 'Internet y avisos',
  notifyHint: 'Los avisos llegan por el sistema de Android, también con la app cerrada.',
  notifyBlocked: 'Las notificaciones están apagadas para Contigo. Actívalas en los ajustes de Android y vuelve aquí.',
  updatesTitle: 'Actualizaciones',
  upToDate: 'Tienes la última versión.',
} as const
