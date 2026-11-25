// Copyright (c) 2026 Dinovance
// Conectar mis bancos: consentimiento, bancos detectados, estado y avisos no leídos. Lógica pura.
// Los métodos del plugin (DetectedBanksApi) están DISEÑADOS POR TIPOS: el backend los confirma en backend-android.md.
import { CAPTURE_AVAILABLE } from './bankAuto'
import { isPackageName } from './captureApps'

/** Contrato esperado del plugin para el flujo simple */
export interface DetectedBanksApi {
  /** Bancos cuya app está instalada: { banks: [{ id, packageName }] } */
  getDetectedBanks(): Promise<unknown>
  /** Activa de una vez el guardado solo de todos los bancos detectados, con el tope por defecto */
  enableAllDetected(): Promise<unknown>
  /** Interruptor general «Guardar solos mis gastos» */
  setAutoSaveAll(o: { enabled: boolean }): Promise<void>
  /** Avisos que no se pudieron leer: { items: [{ reason, maskedText?, at }] }. El texto ya viene enmascarado por el plugin. */
  getCaptureDiagnostics(): Promise<unknown>
}

export type ConsentStep = 'ask' | 'permission' | 'detecting' | 'result' | 'none' | 'error' | 'closed'
export type ConsentEvent =
  | { type: 'accept'; permission: boolean }
  | { type: 'decline' }
  | { type: 'checked'; permission: boolean }
  | { type: 'detected'; count: number }
  | { type: 'failed' }
  | { type: 'retry' }
  | { type: 'done' }

export function consentNext(step: ConsentStep, e: ConsentEvent): ConsentStep {
  switch (step) {
    case 'ask':
      if (e.type === 'accept') return e.permission ? 'detecting' : 'permission'
      return e.type === 'decline' ? 'closed' : step
    case 'permission':
      return e.type === 'checked' && e.permission ? 'detecting' : step
    case 'detecting':
      if (e.type === 'detected') return e.count > 0 ? 'result' : 'none'
      if (e.type === 'failed') return 'error'
      return e.type === 'checked' && !e.permission ? 'permission' : step
    case 'error':
      return e.type === 'retry' ? 'detecting' : e.type === 'done' ? 'closed' : step
    case 'result':
    case 'none':
      return e.type === 'done' ? 'closed' : step
    default:
      return step
  }
}

export type ConsentChoice = 'accepted' | 'declined'
const CONSENT_KEY = 'contigo-bank-consent'

export const readConsent = (): string | null => {
  try {
    return localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}
export const writeConsent = (v: ConsentChoice): void => {
  try {
    localStorage.setItem(CONSENT_KEY, v)
  } catch {
    /* sin almacenamiento: se vuelve a preguntar, no pasa nada */
  }
}

/** Solo la primera vez; «Ahora no» no insiste (queda «Conectar mis bancos» en Ajustes) */
export const shouldAskConsent = (stored: string | null): boolean => stored === null

export interface DetectedBank {
  id: string
  name: string
  packageName: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseDetectedBanks(raw: unknown): DetectedBank[] {
  const rows = isRecord(raw) && Array.isArray(raw['banks']) ? raw['banks'] : []
  const out: DetectedBank[] = []
  for (const r of rows) {
    if (!isRecord(r)) continue
    // Solo las fuentes verificadas: las ocultas no se ofrecen ni se encienden aunque el teléfono las detecte
    const bank = CAPTURE_AVAILABLE.find((b) => b.id === r['id'])
    const pkg = r['packageName']
    if (!bank || typeof pkg !== 'string' || !isPackageName(pkg) || out.some((o) => o.id === bank.id)) continue
    out.push({ id: bank.id, name: bank.name, packageName: pkg })
  }
  return out
}

export const foundLine = (banks: DetectedBank[]): string => (banks.length === 0 ? 'No encontramos apps de bancos en este teléfono.' : `Encontramos: ${banks.map((b) => b.name).join(', ')}`)

export function activatedMessage(banks: DetectedBank[]): string {
  const names = banks.map((b) => b.name)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : (names[0] ?? '')
  return `Listo: ${list} ${names.length > 1 ? 'activados' : 'activado'}`
}

export type CaptureKind = 'active' | 'paused' | 'no-permission'
export function summarizeCapture(s: { listenerAllowed: boolean; enabled: boolean; revoked: boolean }): { kind: CaptureKind; label: string } {
  if (!s.listenerAllowed) return { kind: 'no-permission', label: 'Sin permiso' }
  return s.enabled ? { kind: 'active', label: 'Activo' } : { kind: 'paused', label: 'Pausado' }
}

/** Por qué un aviso no se guardó solo: título corto y explicación, uno propio por cada motivo que manda el teléfono */
export const DIAGNOSTIC_REASONS: Record<string, { title: string; detail: string }> = {
  NO_AMOUNT: { title: 'No encontré un monto', detail: 'No encontré un monto claro en el aviso, así que no lo guardé.' },
  INCOME: { title: 'Parece un abono', detail: 'Parece un abono o un ingreso, y yo solo guardo gastos.' },
  BANK_OFF: { title: 'Banco apagado', detail: 'Ese banco está apagado en Gastos automáticos. Enciéndelo si quieres que lea sus avisos.' },
  LOGIN_REQUIRED: { title: 'Falta iniciar sesión', detail: 'Falta iniciar sesión en Contigo para guardarlo. Abre la app e ingresa a tu cuenta.' },
  FOREIGN_CURRENCY: {
    title: 'Compra en otra moneda',
    detail: 'Es una compra en otra moneda (por ejemplo dólares). Anótala tú con el monto en pesos que cobró tu banco.',
  },
  STALE_DATE: { title: 'Fecha antigua', detail: 'El aviso trae una fecha de hace varios días, así que no lo guardé solo. Si es un gasto nuevo, anótalo tú.' },
  LOW_CONFIDENCE: { title: 'No quedó claro', detail: 'No tuve claro si era un gasto, así que lo dejé para que lo revises.' },
  DUPLICATE: { title: 'Posible repetido', detail: 'Se parece a un gasto que ya tenías anotado, así que no lo guardé de nuevo.' },
  QUEUE_FULL: { title: 'Hay muchos por revisar', detail: 'Tienes muchos gastos detectados sin revisar. Revísalos para que pueda guardar los nuevos.' },
  CAP_EXCEEDED: { title: 'Pasa tu tope', detail: 'El monto supera el tope que pusiste para guardar solo, así que lo dejé para que lo confirmes.' },
  INSTALLMENT_PURCHASE: { title: 'Compra en cuotas', detail: 'La anoté por el total. Confírmala.' },
  INSTALLMENT_TOTAL_UNKNOWN: { title: 'Falta el total', detail: 'El aviso solo trae el valor de la cuota. Pon el total de la compra.' },
  SOURCE_UNAVAILABLE: { title: 'Banco no disponible por ahora', detail: 'Por ahora solo leemos avisos de Banco Falabella y Billetera de Google. Puedes apagar este banco en Gastos automáticos.' },
  INSTALLMENT_CHARGE: { title: 'Cuota de una compra anterior', detail: 'Es el cobro de una cuota de algo que ya anotaste, no un gasto nuevo.' },
  CATEGORY_UNKNOWN: { title: 'Sin categoría', detail: 'No supe en qué categoría ponerlo. Elígela tú al revisarlo.' },
  NOTIFICATIONS_OFF: { title: 'Avisos apagados', detail: 'Las notificaciones de esa app están apagadas, así que no pude leerlas.' },
  PACKAGE_NOT_ALLOWED: { title: 'App sin permiso', detail: 'Esa app no está en tu lista de apps a leer. Agrégala en Gastos automáticos si quieres que lea sus avisos.' },
}
export const diagnosticText = (code: unknown): string => (typeof code === 'string' ? (DIAGNOSTIC_REASONS[code]?.title ?? 'No pude leerlo') : 'No pude leerlo')

export interface DiagnosticItem {
  reason: string
  /** Texto ya enmascarado por el plugin; null = no hay nada que copiar */
  masked: string | null
  at: number | null
}

export function parseDiagnostics(raw: unknown): DiagnosticItem[] {
  const rows = isRecord(raw) && Array.isArray(raw['items']) ? raw['items'] : []
  return rows
    .filter(isRecord)
    .slice(0, 20)
    .map((r) => ({
      reason: diagnosticText(r['reason']),
      masked: typeof r['maskedText'] === 'string' && r['maskedText'] ? r['maskedText'] : null,
      at: typeof r['at'] === 'number' && Number.isFinite(r['at']) ? r['at'] : null,
    }))
}
