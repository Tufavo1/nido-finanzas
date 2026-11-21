// Copyright (c) 2026 Dinovance
// Registro seguro de errores: a la consola solo va el TIPO de error (appError) y al servidor un reporte sin datos.
import { toAppError } from './appError'
import { buildErrorReport } from './clientReport'
import type { ClientErrorReport, ReportSource } from './clientReport'
import { isNativeApp } from './nativeBridge'
import { supabase } from './supabase'

/** Mientras dura esta ventana, el mismo error en la misma pantalla se reporta una sola vez */
const DEDUP_MS = 60_000

export interface SafeLoggerOptions {
  log: (...args: unknown[]) => void
  send: (report: ClientErrorReport) => Promise<void>
  source: ReportSource
  appVersion: string
  now: () => number
}

export interface SafeLogger {
  /** Nunca imprime ni envía el mensaje, los detalles ni la pila del error original */
  error(err: unknown, screen?: string): void
}

export function createSafeLogger(o: SafeLoggerOptions): SafeLogger {
  const lastSent = new Map<string, number>()
  return {
    error(err, screen) {
      const kind = toAppError(err).kind
      o.log('[contigo] error', kind, screen ?? '')
      const key = `${kind}|${screen ?? ''}`
      const at = o.now()
      const prev = lastSent.get(key)
      if (prev !== undefined && at - prev < DEDUP_MS) return
      lastSent.set(key, at)
      const ctx = { source: o.source, appVersion: o.appVersion, ...(screen ? { screen } : {}) }
      // El reporte es un extra: si no sale, no se vuelve a registrar nada (evita bucles)
      void o.send(buildErrorReport(err, ctx)).catch(() => undefined)
    },
  }
}

const appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'desconocida'

/** Registrador de la app: reporta por la RPC `report_client_error` (solo códigos, sin datos). */
export const logger: SafeLogger = createSafeLogger({
  log: (...a) => console.error(...a),
  send: async (report) => {
    await supabase.rpc('report_client_error' as never, report as never)
  },
  source: isNativeApp() ? 'android' : 'web',
  appVersion,
  now: () => Date.now(),
})

export const logError = (err: unknown, screen?: string): void => logger.error(err, screen)
