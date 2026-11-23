// Copyright (c) 2026 Dinovance
import { toAppError } from './appError'
import type { CrashReport } from './nativeBridge'

export type ReportSource = 'web' | 'android' | 'ios'

/** Argumentos de la RPC `report_client_error` (supabase/migrations/20261121120000). Solo códigos y versiones. */
export interface ClientErrorReport {
  p_source: ReportSource
  p_app_version: string
  p_screen: string | null
  p_error_code: string
  p_correlation_id: string | null
  p_stack_top: string | null
}

export interface ReportContext {
  source: ReportSource
  appVersion: string
  screen?: string
  correlationId?: string
}

export type ReportRpc = (args: ClientErrorReport) => Promise<{ error: { message: string } | null }>

const SCREEN = /^[A-Za-z0-9_/.-]{1,64}$/
const VERSION = /^[0-9A-Za-z._+-]{1,32}$/
const CORRELATION = /^[0-9A-Fa-f-]{8,64}$/
const FRAME = /^[A-Za-z_][A-Za-z0-9_.$<>]*(\([A-Za-z0-9_.]*(:[0-9]+)?\))?$/
const MAX_STACK = 1500

const orNull = (value: string | undefined, rule: RegExp): string | null => (value !== undefined && rule.test(value) ? value : null)

function report(code: string, ctx: ReportContext, stack: string | null = null): ClientErrorReport {
  return {
    p_source: ctx.source,
    p_app_version: orNull(ctx.appVersion, VERSION) ?? 'desconocida',
    p_screen: orNull(ctx.screen, SCREEN),
    p_error_code: code,
    p_correlation_id: orNull(ctx.correlationId, CORRELATION),
    p_stack_top: stack,
  }
}

/** Reporte de un error cualquiera: solo el código tipado de appError, nunca el mensaje ni los datos. */
export const buildErrorReport = (err: unknown, ctx: ReportContext): ClientErrorReport => report(toAppError(err).kind, ctx)

/** Marcos de pila válidos, uno por línea, dentro del tope; lo que no calce con el formato se descarta. */
export function sanitizeFrames(frames: string[]): string | null {
  const valid = frames.filter((f) => FRAME.test(f))
  let out = ''
  for (const f of valid) {
    if (out.length + f.length + 1 > MAX_STACK) break
    out += `${out ? '\n' : ''}${f}`
  }
  return out || null
}

export const buildCrashReport = (crash: CrashReport, ctx: Omit<ReportContext, 'appVersion'>): ClientErrorReport =>
  report('APP_CRASH', { ...ctx, appVersion: crash.appVersion }, sanitizeFrames([crash.errorClass, ...crash.frames]))

export interface DiagnosticsPlugin {
  peekCrashReports(): Promise<{ reports: unknown[] }>
  clearCrashReports(): Promise<void>
}

const isCrash = (v: unknown): v is CrashReport =>
  typeof v === 'object' && v !== null && typeof (v as CrashReport).appVersion === 'string' && typeof (v as CrashReport).errorClass === 'string' && Array.isArray((v as CrashReport).frames)

/**
 * Envía los cierres inesperados guardados en el teléfono en el siguiente arranque. Si el servidor rechaza alguno,
 * los reportes se conservan para el próximo intento (nada se pierde ni se borra a medias).
 */
export async function sendPendingCrashReports(plugin: DiagnosticsPlugin, rpc: ReportRpc): Promise<{ sent: number; kept: number }> {
  const { reports } = await plugin.peekCrashReports()
  const crashes = reports.filter(isCrash)
  let sent = 0
  for (const crash of crashes) {
    const { error } = await rpc(buildCrashReport(crash, { source: 'android' }))
    if (error) return { sent, kept: crashes.length - sent }
    sent += 1
  }
  if (crashes.length > 0) await plugin.clearCrashReports()
  return { sent, kept: 0 }
}

/** Latido de salud: si el permiso del servicio se revocó, queda registrado para el panel de seguridad. */
export const buildHealthReport = (revokedSinceConnected: boolean, ctx: ReportContext): ClientErrorReport | null =>
  revokedSinceConnected ? report('LISTENER_REVOKED', ctx) : null
