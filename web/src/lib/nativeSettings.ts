// Copyright (c) 2026 Dinovance
// Ajustes pensados para la APK: pocos grupos, textos simples y el estado de Gastos automáticos. Lógica pura.
import { DIAGNOSTIC_REASONS, diagnosticText } from './bankConsent'

/** Los grupos de Ajustes en la APK, por frecuencia de uso */
export const NATIVE_GROUPS = [
  { id: 'auto', title: 'Gastos automáticos' },
  { id: 'avisos', title: 'Avisos' },
  { id: 'seguridad', title: 'Seguridad' },
  { id: 'cuenta', title: 'Mi cuenta y hogar' },
  { id: 'datos', title: 'Mis datos' },
  { id: 'acerca', title: 'Acerca de' },
] as const

export type NativeGroupId = (typeof NATIVE_GROUPS)[number]['id']

/** Dónde quedó cada apartado de antes (la web los sigue mostrando igual) */
export const LEGACY_TO_GROUP: Record<string, NativeGroupId | 'quitado'> = {
  'Mi perfil financiero': 'cuenta',
  'Mi cuenta': 'cuenta',
  'Mi hogar': 'cuenta',
  'Privacidad con mi pareja': 'cuenta',
  'Ayuda y consejos': 'acerca',
  Apariencia: 'cuenta',
  'Contraseña y sesiones': 'seguridad',
  'Verificación en dos pasos': 'seguridad',
  'Bloqueo de la app': 'seguridad',
  'Seguridad de Contigo': 'seguridad',
  'Captura de gastos': 'auto',
  'Cómo instalar Contigo': 'quitado',
  'Instalación y conexión': 'quitado',
  'Notificaciones (web push)': 'quitado',
  'Respaldo y exportación': 'datos',
  'Salir del hogar o borrar la cuenta': 'datos',
  'Privacidad y términos': 'datos',
  'Acerca de Contigo': 'acerca',
}

/** Lo que no aplica en la APK */
export const APK_REMOVED = ['Cómo instalar Contigo', 'Notificaciones (web push)', 'Instalación y conexión'] as const

/** Montos listos para «Guardar solo hasta…» y para los avisos de la pareja */
export const AMOUNT_CHOICES = [20_000, 50_000, 100_000, 200_000] as const

const clp = new Intl.NumberFormat('es-CL')
export const clpLabel = (n: number): string => `$${clp.format(n)}`

/** Los montos listos; si el actual no está, se suma para que siempre se vea cuál está elegido */
export function amountChoices(current: number): number[] {
  return [...new Set([...AMOUNT_CHOICES, current])].sort((a, b) => a - b)
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** Salud de la captura que informa el teléfono (getCaptureHealth; si no existe se ignora) */
export interface CaptureHealth {
  state: 'ok' | 'no-access' | 'stalled' | 'battery' | 'connecting'
  /** Horas sin recibir avisos (solo con state «stalled» y si se sabe desde cuándo) */
  hours?: number
  /** La desconexión vino justo después de actualizar la app */
  sinceUpdate?: true
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const HEALTH: Record<string, CaptureHealth['state']> = {
  OK: 'ok',
  NO_ACCESS: 'no-access',
  LISTENER_OFF: 'no-access',
  DISCONNECTED: 'stalled',
  NOT_CONNECTED: 'stalled',
  STALLED: 'stalled',
  BATTERY_RESTRICTED: 'battery',
  CONNECTING: 'connecting',
}

/** Lo que no se entiende devuelve null: así se usa el estado que la app ya calcula */
export function adaptCaptureHealth(raw: unknown): CaptureHealth | null {
  if (!isRec(raw) || typeof raw['state'] !== 'string') return null
  const state = HEALTH[raw['state'].toUpperCase()]
  if (!state) return null
  const out: CaptureHealth = { state }
  if (state === 'stalled') {
    const h = raw['disconnectedHours']
    if (typeof h === 'number' && Number.isFinite(h) && h >= 1) out.hours = Math.floor(h)
    if (raw['sinceUpdate'] === true) out.sinceUpdate = true
  }
  return out
}

/** Pide la salud al teléfono; si el método no existe o falla, null (nunca lanza) */
export async function readCaptureHealth(plugin: object): Promise<CaptureHealth | null> {
  try {
    const fn = (plugin as { getCaptureHealth?: () => Promise<unknown> }).getCaptureHealth
    if (typeof fn !== 'function') return null
    return adaptCaptureHealth(await fn.call(plugin))
  } catch {
    return null
  }
}

/** Abre los ajustes de batería si el plugin lo sabe; si no, la ficha de la app (de ahí se llega a Batería) */
export async function openBatterySettings(plugin: object): Promise<void> {
  const p = plugin as { openBatterySettings?: () => Promise<void>; openAppDetails?: () => Promise<void> }
  if (typeof p.openBatterySettings === 'function') return p.openBatterySettings()
  if (typeof p.openAppDetails === 'function') return p.openAppDetails()
}

export type HeadlineAction = { type: 'access' | 'resume' | 'reconnect' | 'battery'; label: string }
export interface Headline {
  kind: 'reading' | 'no-access' | 'paused' | 'idle' | 'stalled' | 'battery' | 'connecting'
  text: string
  /** Explicación corta bajo la línea de estado */
  note?: string
  action?: HeadlineAction
}

const ACCESS: HeadlineAction = { type: 'access', label: 'Activar el acceso' }

/** El estado de Gastos automáticos en una línea */
export function captureHeadline(i: { listenerAllowed: boolean; enabled: boolean; revoked: boolean; activeBanks: readonly string[]; health: CaptureHealth | null }): Headline {
  if (!i.listenerAllowed || i.health?.state === 'no-access') {
    return { kind: 'no-access', text: i.revoked ? 'Se quitó el acceso a los avisos' : 'Falta activar el acceso', action: ACCESS }
  }
  if (!i.enabled) return { kind: 'paused', text: 'En pausa: no estoy leyendo tus avisos', action: { type: 'resume', label: 'Reanudar' } }
  const h = i.health
  if (h?.state === 'connecting') return { kind: 'connecting', text: 'Conectando…' }
  if (h?.state === 'stalled') {
    const text = h.hours ? `Contigo dejó de recibir avisos hace ${h.hours} ${h.hours === 1 ? 'hora' : 'horas'}` : 'Contigo dejó de recibir avisos'
    return { kind: 'stalled', text, ...(h.sinceUpdate ? { note: 'Pasa a veces después de actualizar.' } : {}), action: { type: 'reconnect', label: 'Reconectar' } }
  }
  if (h?.state === 'battery') return { kind: 'battery', text: 'El teléfono puede cerrar Contigo para ahorrar batería', action: { type: 'battery', label: 'Abrir ajustes de batería' } }
  if (i.activeBanks.length === 0) return { kind: 'idle', text: 'El acceso está listo. Enciende un banco para empezar.' }
  return { kind: 'reading', text: `Leyendo los avisos de ${i.activeBanks.length > 3 ? `${i.activeBanks.length} bancos` : joinNames(i.activeBanks)}` }
}

/** Errores nuevos del teléfono al guardar: texto simple y nunca el código */
export function pluginErrorText(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code
  return code === 'STORE_FAILED' || code === 'RESERVED_KEY' ? 'No se pudo guardar de forma segura en este teléfono\nReinicia Contigo e inténtalo de nuevo.' : null
}

export type ClearNoticesResult = 'cleared' | 'unsupported' | 'failed'

/** Lo mínimo del puente nativo que usa el borrado (el método puede no existir en una versión vieja de la app) */
export interface ClearNoticesApi {
  clearDiagnostics?: (options: { atMillis?: number }) => Promise<unknown>
}

/**
 * Borra el diagnóstico local de «Avisos que no pude leer»: la entrada con esa hora (`atMillis`) o, sin hora, todas.
 * No toca borradores ni gastos. Si el puente nativo aún no tiene `clearDiagnostics`, devuelve 'unsupported' sin borrar nada.
 */
export async function clearUnreadNotices(api: ClearNoticesApi, atMillis?: number): Promise<ClearNoticesResult> {
  if (typeof api.clearDiagnostics !== 'function') return 'unsupported'
  try {
    await api.clearDiagnostics(atMillis === undefined ? {} : { atMillis })
    return 'cleared'
  } catch (e) {
    return (e as { code?: unknown } | null)?.code === 'UNIMPLEMENTED' ? 'unsupported' : 'failed'
  }
}

/** Aviso para la persona cuando el borrado no se pudo hacer; null si salió bien */
export function clearNoticesToast(r: ClearNoticesResult): string | null {
  if (r === 'unsupported') return 'Aún no se puede borrar\nActualiza Contigo para borrar estos avisos.'
  return r === 'failed' ? 'No se pudo borrar\nInténtalo de nuevo.' : null
}

const HINTS: Record<string, string> = {
  NO_AMOUNT_IN_TITLE_OR_TEXT: 'El aviso llegó sin monto en el título ni en el texto.',
  EMPTY: 'El aviso llegó vacío.',
  ONLY_TITLE: 'El aviso trajo solo un título, sin el detalle del gasto.',
  ONLY_EXTRA_FIELDS: 'El banco puso los datos en un lugar que no pude leer.',
}

const DETAIL_OTHER = 'No pude entender este aviso. Puedes copiarlo y mostrárselo a quien te ayuda con Contigo.'

export const diagnosticDetail = (code: unknown): string => (typeof code === 'string' ? (DIAGNOSTIC_REASONS[code]?.detail ?? DETAIL_OTHER) : DETAIL_OTHER)

export interface DetailedDiagnostic {
  reason: string
  detail: string
  /** Texto ya enmascarado por el teléfono; null = no hay nada que copiar */
  masked: string | null
  at: number | null
}

export function parseDiagnosticsDetailed(raw: unknown): DetailedDiagnostic[] {
  const rows = isRec(raw) && Array.isArray(raw['items']) ? raw['items'] : []
  return rows
    .filter(isRec)
    .slice(0, 20)
    .map((r) => ({
      reason: diagnosticText(r['reason']),
      // La pista de qué traía el aviso solo explica el «sin monto»; los demás motivos ya se explican solos
      detail: (r['reason'] === 'NO_AMOUNT' && typeof r['hint'] === 'string' ? HINTS[r['hint']] : undefined) ?? diagnosticDetail(r['reason']),
      masked: typeof r['maskedText'] === 'string' && r['maskedText'] ? r['maskedText'] : null,
      at: typeof r['at'] === 'number' && Number.isFinite(r['at']) ? r['at'] : null,
    }))
}
