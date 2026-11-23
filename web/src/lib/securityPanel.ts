// Copyright (c) 2026 Dinovance
// Panel de seguridad del administrador: tipos de la RPC `security_overview` y reglas de presentación. Solo lectura.
import { supabase } from './supabase'

export type PanelSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type Health = 'ok' | 'degraded' | 'down'
export type HealthKey = 'db' | 'auth' | 'gateway' | 'push_queue'

export interface SecurityAlertRow {
  id: string
  severity: PanelSeverity
  kind: string
  title: string
  detail: string
  at: string
}
export interface SecurityEventRow {
  id: string
  at: string
  kind: string
  severity: PanelSeverity
  actor_hint: string
  detail: string
}
export interface SecurityOverview {
  generated_at: string
  counters: Record<string, number>
  alerts: SecurityAlertRow[]
  events: SecurityEventRow[]
  health: Record<HealthKey, Health>
}

export const HOUR_OPTIONS = [1, 6, 24, 72, 168] as const
export const DEFAULT_HOURS = 24

/** Lo que el panel NO garantiza: se muestra siempre a la vista. */
export const PANEL_LIMIT_NOTICE =
  'Este panel muestra INDICIOS de actividad sospechosa. No garantiza detectar todo ataque: un panel sin alertas no significa que no haya pasado nada.'

const SEVERITY_ORDER: Record<PanelSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
export const SEVERITY_LABEL: Record<PanelSeverity, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja', info: 'Informativa' }
export const HEALTH_LABEL: Record<Health, string> = { ok: 'Funciona', degraded: 'Con problemas', down: 'Caído' }
export const HEALTH_NAME: Record<HealthKey, string> = { db: 'Base de datos', auth: 'Inicio de sesión', gateway: 'Puerta de entrada', push_queue: 'Cola de avisos al teléfono' }

/** Nombres de los contadores conocidos; los que el servidor agregue después se muestran con su clave */
export const COUNTER_LABEL: Record<string, string> = {
  login_failed_blocked: 'Inicios fallidos o bloqueados',
  mfa_failed: 'Códigos de dos pasos fallidos',
  new_device: 'Dispositivos nuevos',
  recoveries: 'Recuperaciones de contraseña',
}

/** Más grave primero; a igual gravedad, lo más reciente primero. No modifica la lista recibida. */
export function sortBySeverity<T extends { severity: PanelSeverity; at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Date.parse(b.at) - Date.parse(a.at))
}

export const hoursLabel = (h: number): string => (h < 24 ? `${h} ${h === 1 ? 'hora' : 'horas'}` : h % 24 === 0 ? `${h / 24} ${h === 24 ? 'día' : 'días'}` : `${h} horas`)

/** Resumen de salud: el peor estado manda */
export function overallHealth(h: SecurityOverview['health']): Health {
  const all = Object.values(h)
  return all.includes('down') ? 'down' : all.includes('degraded') ? 'degraded' : 'ok'
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const SEVERITIES = new Set(Object.keys(SEVERITY_ORDER))
const HEALTHS = new Set<string>(['ok', 'degraded', 'down'])
const HEALTH_KEYS = Object.keys(HEALTH_NAME) as HealthKey[]

const validAlert = (a: unknown): a is SecurityAlertRow => isObj(a) && typeof a.id === 'string' && SEVERITIES.has(a.severity as string) && typeof a.title === 'string' && typeof a.at === 'string'
const validEvent = (e: unknown): e is SecurityEventRow => isObj(e) && typeof e.id === 'string' && SEVERITIES.has(e.severity as string) && typeof e.kind === 'string' && typeof e.at === 'string'

/** Valida la respuesta del servidor. Lo que no tenga la forma esperada se descarta; sin forma mínima devuelve null. */
export function parseOverview(raw: unknown): SecurityOverview | null {
  if (!isObj(raw) || typeof raw.generated_at !== 'string' || !isObj(raw.counters) || !isObj(raw.health)) return null
  const counters: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw.counters)) if (typeof v === 'number' && Number.isFinite(v)) counters[k] = v
  const health = {} as Record<HealthKey, Health>
  for (const k of HEALTH_KEYS) {
    const v = raw.health[k]
    // Un estado desconocido se trata como caído: es lo prudente para un panel de seguridad
    health[k] = typeof v === 'string' && HEALTHS.has(v) ? (v as Health) : 'down'
  }
  const alerts = Array.isArray(raw.alerts) ? raw.alerts.filter(validAlert).map((a) => ({ id: a.id, severity: a.severity, kind: String(a.kind ?? ''), title: a.title, detail: String(a.detail ?? ''), at: a.at })) : []
  const events = Array.isArray(raw.events)
    ? raw.events.filter(validEvent).map((e) => ({ id: e.id, at: e.at, kind: e.kind, severity: e.severity, actor_hint: String(e.actor_hint ?? ''), detail: String(e.detail ?? '') }))
    : []
  return { generated_at: raw.generated_at, counters, alerts, events, health }
}

export async function fetchSecurityOverview(hours: number): Promise<SecurityOverview> {
  const { data, error } = await supabase.rpc('security_overview' as never, { p_hours: hours } as never)
  if (error) throw error
  const parsed = parseOverview(data)
  if (!parsed) throw new Error('La respuesta del panel de seguridad no tiene el formato esperado')
  return parsed
}
