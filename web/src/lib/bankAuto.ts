// Copyright (c) 2026 Dinovance
// Registro automático por banco, estado de envío y aviso de gastos de la pareja. Lógica pura.
// Los métodos del plugin (BankAutoApi) están DISEÑADOS POR TIPOS: el backend los documentará en backend-android.md;
// si el nombre real difiere, solo cambia esta interfaz.
import { isPackageName } from './captureApps'

export interface Bank {
  id: string
  name: string
}
export const BANKS: readonly Bank[] = [
  { id: 'santander', name: 'Santander' },
  { id: 'banco-estado', name: 'Banco Estado' },
  { id: 'banco-falabella', name: 'Banco Falabella' },
  { id: 'banco-chile', name: 'Banco de Chile' },
]

export interface BankPreset extends Bank {
  /** App del banco asociada (elegida con el modo aprender); null = sin app asociada */
  packageName: string | null
  /** «Guardar solos los gastos de este banco». Apagado por defecto. */
  autoSave: boolean
}

/** Contrato esperado del plugin (aún no está en nativeBridge). */
export interface BankAutoApi {
  getBankPresets(): Promise<{ banks: unknown[] }>
  setBankAutoSave(o: { bankId: string; enabled: boolean }): Promise<void>
  /** Asocia la app del banco; `packageName: null` la quita */
  setBankPackage(o: { bankId: string; packageName: string | null }): Promise<void>
  setAutoCap(o: { maxClp: number }): Promise<void>
  getSyncState(): Promise<unknown>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Siempre los cuatro bancos. Sin app asociada no puede quedar encendido el guardado automático. */
export function parseBankPresets(raw: unknown): BankPreset[] {
  const rows = isRecord(raw) && Array.isArray(raw['banks']) ? raw['banks'].filter(isRecord) : []
  return BANKS.map((b) => {
    const row = rows.find((r) => r['id'] === b.id)
    const pkg = row && typeof row['packageName'] === 'string' && isPackageName(row['packageName']) ? row['packageName'] : null
    return { ...b, packageName: pkg, autoSave: pkg !== null && row?.['autoSave'] === true }
  })
}

export const bankStatus = (b: BankPreset): string => (b.packageName ? `App asociada: ${b.packageName}` : 'Sin app asociada')

export type SyncKind = 'idle' | 'syncing' | 'error'
export interface SyncState {
  state: SyncKind
  lastSyncAt: number | null
  pending: number
}

export function parseSyncState(raw: unknown): SyncState {
  const r = isRecord(raw) ? raw : {}
  const state = r['state'] === 'syncing' || r['state'] === 'error' ? r['state'] : 'idle'
  const pending = typeof r['pending'] === 'number' && Number.isSafeInteger(r['pending']) && r['pending'] > 0 ? r['pending'] : 0
  const last = typeof r['lastSyncAt'] === 'number' && Number.isFinite(r['lastSyncAt']) ? r['lastSyncAt'] : null
  return { state, lastSyncAt: last, pending }
}

const gastos = (n: number) => `${n} ${n === 1 ? 'gasto' : 'gastos'}`

export function syncSummary(s: SyncState): string {
  if (s.state === 'syncing') return `Enviando ${gastos(s.pending)}…`
  if (s.state === 'error') return `No pudimos enviar ${gastos(s.pending)}. Lo intentaremos de nuevo cuando haya internet.`
  return s.pending > 0 ? `Tienes ${gastos(s.pending)} por enviar.` : 'Todo al día. No hay gastos por enviar.'
}

export const DEFAULT_PARTNER_THRESHOLD = 50_000
const MAX_THRESHOLD = 10_000_000_000

export type ThresholdResult = { ok: true; value: number } | { ok: false; error: string }

/** Umbral en pesos enteros; acepta puntos de miles. */
export function parseThreshold(text: string): ThresholdResult {
  const clean = text.trim().replace(/\./g, '')
  if (!/^\d+$/.test(clean)) return { ok: false, error: 'Escribe un monto en pesos, solo números.' }
  const value = Number(clean)
  if (value < 1) return { ok: false, error: 'El monto debe ser mayor que cero.' }
  if (value >= MAX_THRESHOLD) return { ok: false, error: 'Ese monto es demasiado grande.' }
  return { ok: true, value }
}
