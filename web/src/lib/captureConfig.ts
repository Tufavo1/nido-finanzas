// Copyright (c) 2026 Dinovance
// Preferencias de la captura de gastos. Se guardan en el almacén seguro del teléfono (nunca en localStorage).
import { DEFAULT_CAPTURE_SETTINGS } from './candidates'
import type { CaptureMode } from './candidates'
import { isPackageName } from './captureApps'

export interface CaptureConfig {
  mode: CaptureMode
  /** Tope del modo automático, en pesos (inclusivo) */
  maxClp: number
  /** Los gastos detectados parten como compartidos */
  shared: boolean
  /** Apps elegidas; se recuerdan aunque la captura esté apagada */
  savedPackages: string[]
  /** Interruptor de captura: apagado, el teléfono no lee ningún aviso */
  enabled: boolean
}

/** Rango del tope del modo automático (pesos enteros) */
export const MIN_CAP_CLP = 1_000
export const MAX_CAP_CLP = 5_000_000

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = { ...DEFAULT_CAPTURE_SETTINGS, shared: true, savedPackages: [], enabled: true }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Lee lo guardado; cualquier cosa rara vuelve al valor por defecto (modo automático apagado). */
export function parseCaptureConfig(raw: string | null): CaptureConfig {
  let v: unknown
  try {
    v = raw === null ? null : JSON.parse(raw)
  } catch {
    return DEFAULT_CAPTURE_CONFIG
  }
  if (!isRecord(v)) return DEFAULT_CAPTURE_CONFIG
  const d = DEFAULT_CAPTURE_CONFIG
  return {
    mode: v['mode'] === 'AUTO' ? 'AUTO' : d.mode,
    maxClp: typeof v['maxClp'] === 'number' && Number.isInteger(v['maxClp']) && v['maxClp'] >= MIN_CAP_CLP && v['maxClp'] <= MAX_CAP_CLP ? v['maxClp'] : d.maxClp,
    shared: typeof v['shared'] === 'boolean' ? v['shared'] : d.shared,
    savedPackages: Array.isArray(v['savedPackages']) ? v['savedPackages'].filter((p): p is string => typeof p === 'string' && isPackageName(p)) : [],
    enabled: typeof v['enabled'] === 'boolean' ? v['enabled'] : d.enabled,
  }
}

export const serializeCaptureConfig = (c: CaptureConfig): string => JSON.stringify(c)
