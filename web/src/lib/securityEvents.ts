// Copyright (c) 2026 Dinovance

export type SecurityEventType = 'login_ok' | 'login_failed' | 'login_blocked' | 'mfa_failed' | 'new_device' | 'role_change' | 'password_change' | 'account_deleted'
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface SecurityEvent {
  type: SecurityEventType
  /** ms desde epoch */
  at: number
  userId?: string
  ip?: string
  deviceId?: string
  /** Datos extra; NUNCA debe llegar a una alerta nada de lo sensible que traiga (password, token, texto) */
  meta?: Record<string, unknown>
}

export interface ClassifiedEvent {
  type: SecurityEventType
  severity: Severity
  at: number
  userId?: string
  ip?: string
  deviceId?: string
}

export type AlertKind = 'brute_force' | 'credential_stuffing' | 'new_device' | 'privilege_escalation' | 'mfa_repeated_failure'
export interface SecurityAlert {
  kind: AlertKind
  severity: Severity
  /** Usuario o IP afectada */
  subject: string
  count: number
  firstAt: number
  lastAt: number
}

const WINDOW_MS = 10 * 60_000
const BRUTE_FORCE_HIGH = 5
const BRUTE_FORCE_CRITICAL = 20
const STUFFING_ACCOUNTS = 10
const MFA_FAILURES = 3
const UNKNOWN_SUBJECT = 'desconocido'

const BASE_SEVERITY: Record<SecurityEventType, Severity> = {
  login_ok: 'info',
  login_failed: 'low',
  login_blocked: 'medium',
  mfa_failed: 'medium',
  new_device: 'medium',
  role_change: 'medium',
  password_change: 'medium',
  account_deleted: 'medium',
}

const grantsAdmin = (e: SecurityEvent) => e.type === 'role_change' && e.meta?.['to'] === 'admin'

/** Severidad de un evento suelto. Devuelve solo campos seguros (sin meta). */
export function classifyEvent(e: SecurityEvent): ClassifiedEvent {
  const out: ClassifiedEvent = { type: e.type, severity: grantsAdmin(e) ? 'high' : BASE_SEVERITY[e.type], at: e.at }
  if (e.userId !== undefined) out.userId = e.userId
  if (e.ip !== undefined) out.ip = e.ip
  if (e.deviceId !== undefined) out.deviceId = e.deviceId
  return out
}

function groupBy<T>(items: T[], key: (t: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (k === undefined) continue
    groups.set(k, [...(groups.get(k) ?? []), item])
  }
  return groups
}

const span = (events: SecurityEvent[]) => ({ firstAt: Math.min(...events.map((e) => e.at)), lastAt: Math.max(...events.map((e) => e.at)) })

function alert(kind: AlertKind, severity: Severity, subject: string, count: number, events: SecurityEvent[]): SecurityAlert {
  return { kind, severity, subject, count, ...span(events) }
}

function bruteForce(failed: SecurityEvent[]): SecurityAlert[] {
  return [...groupBy(failed, (e) => e.userId)]
    .filter(([, list]) => list.length >= BRUTE_FORCE_HIGH)
    .map(([user, list]) => alert('brute_force', list.length >= BRUTE_FORCE_CRITICAL ? 'critical' : 'high', user, list.length, list))
}

function credentialStuffing(failed: SecurityEvent[]): SecurityAlert[] {
  return [...groupBy(failed, (e) => e.ip)].flatMap(([ip, list]) => {
    const accounts = new Set(list.map((e) => e.userId).filter((u): u is string => u !== undefined))
    return accounts.size >= STUFFING_ACCOUNTS ? [alert('credential_stuffing', 'high', ip, accounts.size, list)] : []
  })
}

function newDevices(events: SecurityEvent[]): SecurityAlert[] {
  return [...groupBy(events, (e) => e.userId ?? UNKNOWN_SUBJECT)].map(([user, list]) => alert('new_device', 'medium', user, list.length, list))
}

function mfaFailures(events: SecurityEvent[]): SecurityAlert[] {
  return [...groupBy(events, (e) => e.userId)]
    .filter(([, list]) => list.length >= MFA_FAILURES)
    .map(([user, list]) => alert('mfa_repeated_failure', 'high', user, list.length, list))
}

// Quien da el rol sin ser administrador (o sin que se sepa) es una escalada crítica.
function escalations(events: SecurityEvent[]): SecurityAlert[] {
  return events.map((e) => alert('privilege_escalation', e.meta?.['actorIsAdmin'] === true ? 'high' : 'critical', e.userId ?? UNKNOWN_SUBJECT, 1, [e]))
}

const RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 }

/** Alertas a partir de una lista de eventos. `now` explícito; ventana de 10 minutos. */
export function detectAlerts(events: SecurityEvent[], now: number): SecurityAlert[] {
  const recent = events.filter((e) => e.at >= now - WINDOW_MS && e.at <= now)
  const of = (type: SecurityEventType) => recent.filter((e) => e.type === type)
  const alerts = [
    ...bruteForce(of('login_failed')),
    ...credentialStuffing(of('login_failed')),
    ...newDevices(of('new_device')),
    ...mfaFailures(of('mfa_failed')),
    ...escalations(recent.filter(grantsAdmin)),
  ]
  return alerts.sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.lastAt - a.lastAt)
}
