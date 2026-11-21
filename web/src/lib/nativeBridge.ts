// Copyright (c) 2026 Dinovance
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { CandidateConfidence, CandidateKind, ParsedCandidate } from './candidates'
import type { SecureBackend } from './secureSession'

/** Estado de la captura de gastos en el teléfono (sin ningún dato del usuario). */
export interface CaptureStatus {
  /** La persona concedió «Acceso a notificaciones» */
  listenerAllowed: boolean
  /** El sistema tiene conectado el servicio ahora mismo */
  listenerConnected: boolean
  /** Estuvo conectado alguna vez y ahora el permiso ya no está: avisar y guiar de nuevo */
  revokedSinceConnected: boolean
  notificationsAllowed: boolean
  batteryOptimized: boolean
  /** Android 13+ instalado fuera de Play Store: falta «Permitir ajustes restringidos» */
  restrictedSettingsLikely: boolean
  /** ms desde epoch del último aviso bancario procesado; null si nunca */
  lastEventAt: number | null
  lastHeartbeatAt: number | null
  failures: number
  /** Nombre de la clase del último error del servicio (sin mensaje) */
  lastFailureClass: string | null
  whitelistCount: number
  hideOnLockScreen: boolean
}

export type DraftStatus = 'PENDING' | 'CONFIRMED'

/** Borrador capturado: el candidato del parser, sin texto bruto, más su id y estado. */
export interface NativeDraft extends ParsedCandidate {
  id: string
  createdAtMillis: number
  /** CONFIRMED: la persona tocó «Guardar» en la notificación; falta enviarlo al servidor */
  status: DraftStatus
  /** Hay otro borrador igual de hace menos de 2 minutos: se conserva y se marca, la persona decide (H-04) */
  possibleDuplicate?: boolean
  /** App que avisó (trazabilidad) */
  sourcePackage?: string
}

/** Cierre inesperado sin datos personales (clase de la excepción y marcos de pila). */
export interface CrashReport {
  at: number
  appVersion: string
  errorClass: string
  frames: string[]
}

export interface ContigoNativePlugin {
  getStatus(): Promise<CaptureStatus>
  openPermissionGuide(): Promise<void>
  openListenerSettings(): Promise<void>
  openAppDetails(): Promise<void>
  requestNotificationPermission(): Promise<void>

  getAllowedPackages(): Promise<{ packages: string[] }>
  /** Lista vacía = la captura queda inactiva. Rechaza nombres de paquete no válidos. */
  setAllowedPackages(options: { packages: string[] }): Promise<void>
  /** Apps que mostraron notificaciones hace poco, para elegir cuáles vigilar. Solo paquete, nombre y hora: jamás texto. */
  getRecentNotifyingApps(): Promise<{ apps: unknown[] }>
  /** «Borrar todo lo capturado»: borradores, notificaciones propias y lista de apps recientes. No cierra la sesión. */
  clearCaptured(): Promise<void>
  /** Por defecto true (decisión 5): oculta monto y comercio con el teléfono bloqueado */
  setHideOnLockScreen(options: { hide: boolean }): Promise<void>

  /** Solo los borradores del dueño activo. `pendingToSend` = confirmados con «Guardar» que faltan por enviar. */
  listDrafts(): Promise<{ drafts: unknown[]; pendingToSend?: number }>
  /** Al iniciar sesión: usuario y hogar (clave opaca `usuario:hogar`); null sin sesión. Sin dueño no se captura. */
  setActiveOwner(options: { ownerKey: string | null }): Promise<void>
  /** Borra TODAS las colas `queue-*` del almacén seguro (de cualquier hogar). No toca la sesión. */
  clearQueues(): Promise<void>
  /** Cambio de cuenta: borra colas ajenas y borradores que no son del dueño nuevo, fija el dueño. Nunca borra la sesión nueva. */
  wipeForAccountSwitch(options: { ownerKey: string | null }): Promise<void>
  removeDraft(options: { id: string }): Promise<void>
  /** Id del borrador abierto desde la notificación (se entrega una sola vez) */
  consumePendingOpen(): Promise<{ id: string | null }>

  secureGet(options: { key: string }): Promise<{ value: string | null }>
  secureSet(options: { key: string; value: string }): Promise<void>
  secureRemove(options: { key: string }): Promise<void>
  /** Cierre de sesión o borrado de cuenta: vacía sesión, cola y notificaciones propias */
  wipe(): Promise<void>

  peekCrashReports(): Promise<{ reports: unknown[] }>
  clearCrashReports(): Promise<void>

  addListener(event: 'draftsChanged', listener: () => void): Promise<PluginListenerHandle>
  addListener(event: 'draftOpen', listener: (e: { id: string }) => void): Promise<PluginListenerHandle>
}

export const ContigoNative = registerPlugin<ContigoNativePlugin>('ContigoNative')

/** true dentro de la app Android o iOS; false en el navegador (PWA). */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform()

const KINDS: readonly CandidateKind[] = ['EXPENSE', 'INCOME']
const CONFIDENCES: readonly CandidateConfidence[] = ['HIGH', 'MEDIUM', 'LOW']
const MAX_AMOUNT = 10_000_000_000
const MAX_MERCHANT = 60

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

function readInstallment(v: unknown): { n: number; total: number } | null | undefined {
  if (v === null || v === undefined) return null
  if (!isRecord(v) || !isCount(v['n']) || !isCount(v['total'])) return undefined
  return v['n'] >= 1 && v['n'] <= v['total'] ? { n: v['n'], total: v['total'] } : undefined
}

/** Valida lo que llega del plugin (frontera): descarta lo que no tenga la forma exacta, nunca lanza. */
export function parseNativeDraft(raw: unknown): NativeDraft | null {
  if (!isRecord(raw)) return null
  const { id, amountClp, merchant, kind, confidence, fingerprint, postedAtMillis, createdAtMillis, status } = raw
  const installment = readInstallment(raw['installment'])
  const merchantOk = merchant === null || merchant === undefined || (typeof merchant === 'string' && merchant.length <= MAX_MERCHANT)
  if (typeof id !== 'string' || id === '' || !isCount(amountClp) || amountClp < 1 || amountClp >= MAX_AMOUNT) return null
  if (!KINDS.includes(kind as CandidateKind) || !CONFIDENCES.includes(confidence as CandidateConfidence)) return null
  if (typeof fingerprint !== 'string' || !isCount(postedAtMillis) || !isCount(createdAtMillis)) return null
  if (!merchantOk || installment === undefined || (status !== 'PENDING' && status !== 'CONFIRMED')) return null
  return {
    id,
    amountClp,
    merchant: typeof merchant === 'string' ? merchant : null,
    kind: kind as CandidateKind,
    confidence: confidence as CandidateConfidence,
    installment,
    fingerprint,
    postedAtMillis,
    createdAtMillis,
    status,
    ...(raw['possibleDuplicate'] === true ? { possibleDuplicate: true } : {}),
    ...(typeof raw['sourcePackage'] === 'string' && raw['sourcePackage'].length <= 200 ? { sourcePackage: raw['sourcePackage'] } : {}),
  }
}

/** Dueño activo del teléfono: `usuario:hogar` con solo caracteres seguros (lo valida también el plugin). */
export const ownerKeyOf = (userId: string, householdId: string): string => `${userId}:${householdId}`

/** Gastos que la persona guardó en la notificación y faltan por enviar (el plugin ya filtra por dueño). */
export async function pendingToSendCount(plugin: Pick<ContigoNativePlugin, 'listDrafts'>): Promise<number> {
  const drafts = await readDrafts(plugin)
  return drafts.filter((d) => d.status === 'CONFIRMED').length
}

export interface NotifyingApp {
  packageName: string
  /** Nombre visible; si el sistema no lo da, el nombre del paquete */
  label: string
  lastSeenMillis: number
}

const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/
const MAX_LABEL = 100

/** Valida cada app que llega del plugin (frontera); lo que no calce se descarta. Más reciente primero. */
export function parseNotifyingApp(raw: unknown): NotifyingApp | null {
  if (!isRecord(raw)) return null
  const { packageName, label, lastSeenMillis } = raw
  if (typeof packageName !== 'string' || !PACKAGE_NAME.test(packageName) || packageName.length > 200) return null
  if (!isCount(lastSeenMillis)) return null
  return { packageName, label: typeof label === 'string' && label.trim() !== '' ? label.trim().slice(0, MAX_LABEL) : packageName, lastSeenMillis }
}

export async function readRecentApps(plugin: Pick<ContigoNativePlugin, 'getRecentNotifyingApps'>): Promise<NotifyingApp[]> {
  const { apps } = await plugin.getRecentNotifyingApps()
  return apps.map(parseNotifyingApp).filter((a): a is NotifyingApp => a !== null).sort((a, b) => b.lastSeenMillis - a.lastSeenMillis)
}

/** Borradores válidos de la cola cifrada del teléfono, del más antiguo al más nuevo. */
export async function readDrafts(plugin: Pick<ContigoNativePlugin, 'listDrafts'>): Promise<NativeDraft[]> {
  const { drafts } = await plugin.listDrafts()
  return drafts.map(parseNativeDraft).filter((d): d is NativeDraft => d !== null).sort((a, b) => a.createdAtMillis - b.createdAtMillis)
}

/** Almacén seguro para `createSecureStorage`: la sesión queda en Android Keystore. */
export function createPluginSecureBackend(plugin: Pick<ContigoNativePlugin, 'secureGet' | 'secureSet' | 'secureRemove'>): SecureBackend {
  return {
    get: async (key) => (await plugin.secureGet({ key })).value ?? null,
    set: (key, value) => plugin.secureSet({ key, value }),
    remove: (key) => plugin.secureRemove({ key }),
  }
}

/** ¿Hay que volver a guiar a la persona? (permiso revocado o servicio sin conectar con la lista llena). */
export function needsPermissionGuide(status: CaptureStatus): boolean {
  return status.revokedSinceConnected || (status.whitelistCount > 0 && !status.listenerAllowed)
}
