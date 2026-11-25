// Copyright (c) 2026 Dinovance
// Registro automático por banco, estado de envío y aviso de gastos de la pareja. Lógica pura.
// Los métodos del plugin (BankAutoApi) están DISEÑADOS POR TIPOS: el backend los documentará en backend-android.md;
// si el nombre real difiere, solo cambia esta interfaz.
import { isPackageName } from './captureApps'

export interface Bank {
  id: string
  name: string
  /** ¿La captura de avisos de esta fuente está verificada? Solo las verificadas se ofrecen. El dueño las reactiva una a una. */
  available: boolean
}
export const BANKS: readonly Bank[] = [
  { id: 'santander', name: 'Santander', available: false },
  { id: 'banco-estado', name: 'Banco Estado', available: false },
  { id: 'banco-falabella', name: 'Banco Falabella', available: true },
  { id: 'banco-chile', name: 'Banco de Chile', available: false },
  // No es un banco: la billetera del teléfono (pagos sin contacto). El nativo la trata como una fuente más (id estable).
  { id: 'billetera-google', name: 'Billetera de Google', available: true },
]

/** Única lista de fuentes que se pueden conectar: de aquí salen todos los selectores y textos de captura */
export const CAPTURE_AVAILABLE: readonly Bank[] = BANKS.filter((b) => b.available)

/** Qué sí funciona hoy (Hick: no se muestran opciones que no funcionan) */
export const CAPTURE_AVAILABLE_TEXT = `Por ahora funciona con ${CAPTURE_AVAILABLE.map((b) => b.name).join(' y ')}. Pronto sumaremos más bancos.`

/** Para quien ya la tenía encendida antes de ocultarla */
export const CAPTURE_UNAVAILABLE_LABEL = 'Ya no disponible por ahora'

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

/**
 * Las fuentes disponibles, más las ocultas solo si ya estaban encendidas (para poder apagarlas).
 * Sin app asociada no puede quedar encendido el guardado automático.
 */
export function parseBankPresets(raw: unknown): BankPreset[] {
  const rows = isRecord(raw) && Array.isArray(raw['banks']) ? raw['banks'].filter(isRecord) : []
  const presets = BANKS.map((b) => {
    const row = rows.find((r) => r['id'] === b.id)
    const pkg = row && typeof row['packageName'] === 'string' && isPackageName(row['packageName']) ? row['packageName'] : null
    return { ...b, packageName: pkg, autoSave: pkg !== null && row?.['autoSave'] === true }
  })
  return presets.filter((p) => p.available || p.autoSave)
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

/** Errores del último envío que se arreglan volviendo a entrar (sesión o perfil del hogar) */
const SIGN_IN_ERRORS: readonly string[] = ['OWNER', 'NO_PROFILE']

/** ¿El último envío falló porque hay que volver a entrar? Lee `lastError` de `getSyncState`; nunca se muestra el código. */
export function syncNeedsSignIn(raw: unknown): boolean {
  return isRecord(raw) && typeof raw['lastError'] === 'string' && SIGN_IN_ERRORS.includes(raw['lastError'])
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
