// Copyright (c) 2026 Dinovance
import { toAppError, type AppErrorKind } from './appError'
import type { ExpenseDraft } from './candidates'
import { isAlreadySaved, newId, type WriteResult } from './idempotency'

export type QueuePayload = ExpenseDraft & { id?: string }
export interface QueueItem {
  /** Identificador idempotente (newId), el mismo en cada reintento */
  id: string
  payload: ExpenseDraft
  createdAt: number
  attempts: number
  /** 'review': no se reintenta (error de validación o demasiados intentos) */
  status: 'pending' | 'review'
}

/** Persistencia inyectable (en la app: almacén cifrado). */
export interface QueueStore {
  load(): Promise<QueueItem[]>
  save(items: QueueItem[]): Promise<void>
}

export interface OfflineQueueOptions {
  store: QueueStore
  /** Envía un gasto con su id; devuelve el resultado de la base (error.code 23505 = ya existía) */
  send: (item: { id: string; payload: ExpenseDraft }) => Promise<WriteResult>
  maxItems?: number
  maxAttempts?: number
}

export type EnqueueResult = { ok: true; id: string } | { ok: false; reason: 'full' }
export interface FlushResult { sent: string[]; review: string[]; remaining: number }

export interface OfflineQueue {
  enqueue(payload: ExpenseDraft, now: number): Promise<EnqueueResult>
  pending(): Promise<QueueItem[]>
  flush(): Promise<FlushResult>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const DEFAULT_MAX_ITEMS = 500
export const DEFAULT_MAX_ATTEMPTS = 5

type Outcome = 'sent' | 'review' | 'retry' | 'needs-login'

/** El reintento no arregla estos errores: la persona debe revisarlos. */
const REVIEW_KINDS: ReadonlySet<AppErrorKind> = new Set(['VALIDATION', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'])
const LOGIN_KINDS: ReadonlySet<AppErrorKind> = new Set(['UNAUTHORIZED', 'SESSION_EXPIRED'])

function outcomeOf(result: WriteResult): Outcome {
  if (!result.error || isAlreadySaved(result)) return 'sent'
  const kind = toAppError({ status: result.status, error: result.error }).kind
  if (LOGIN_KINDS.has(kind)) return 'needs-login'
  return REVIEW_KINDS.has(kind) ? 'review' : 'retry'
}

export function createOfflineQueue(o: OfflineQueueOptions): OfflineQueue {
  const maxItems = o.maxItems ?? DEFAULT_MAX_ITEMS
  const maxAttempts = o.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  // Se carga una vez y luego se escribe en el almacén después de cada cambio.
  let items: QueueItem[] | null = null
  let flushing: Promise<FlushResult> | null = null

  const all = async (): Promise<QueueItem[]> => (items ??= await o.store.load())
  const persist = async () => o.store.save(items ?? [])
  const pendingCount = () => (items ?? []).filter((i) => i.status === 'pending').length

  async function enqueue(payload: ExpenseDraft, now: number): Promise<EnqueueResult> {
    const list = await all()
    // Si el gasto ya trae su id (viene de un borrador), se usa ese MISMO id en todo el camino: así reenviar no duplica.
    const { id: givenId, ...expense } = payload as QueuePayload
    const id = givenId !== undefined && UUID.test(givenId) ? givenId.toLowerCase() : newId()
    if (list.some((i) => i.id === id)) return { ok: true, id }
    if (list.length >= maxItems) return { ok: false, reason: 'full' }
    list.push({ id, payload: expense, createdAt: now, attempts: 0, status: 'pending' })
    await persist()
    return { ok: true, id }
  }

  /** Aplica el resultado de un envío; devuelve true si hay que cortar el vaciado para no romper el orden. */
  async function settle(item: QueueItem, outcome: Outcome, result: FlushResult): Promise<boolean> {
    if (outcome === 'sent') {
      items = (items ?? []).filter((i) => i.id !== item.id)
      result.sent.push(item.id)
    } else if (outcome === 'needs-login') {
      return true
    } else {
      item.attempts += 1
      if (outcome === 'review' || item.attempts >= maxAttempts) {
        item.status = 'review'
        result.review.push(item.id)
      }
    }
    await persist()
    return outcome === 'retry'
  }

  async function run(): Promise<FlushResult> {
    const result: FlushResult = { sent: [], review: [], remaining: 0 }
    const queue = [...(await all())].filter((i) => i.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)
    for (const item of queue) {
      const outcome = outcomeOf(await o.send({ id: item.id, payload: item.payload }))
      if (await settle(item, outcome, result)) break
    }
    result.remaining = pendingCount()
    return result
  }

  return {
    enqueue,
    pending: async () => structuredClone(await all()),
    // Dos vaciados a la vez enviarían lo mismo dos veces: el segundo espera al primero.
    flush: () => (flushing ??= run().finally(() => (flushing = null))),
  }
}

/** Espera antes del intento número `attempts` (1 = primero): se duplica y nunca pasa del tope. */
export function retryDelayMs(attempts: number, baseMs = 2_000, capMs = 300_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempts - 1))
}

export interface DrainOptions {
  /** Rondas máximas antes de rendirse hasta el próximo arranque o regreso de la red */
  maxRounds?: number
  sleep?: (ms: number) => Promise<void>
  baseMs?: number
  capMs?: number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Vacía la cola reintentando con retroceso exponencial y tope mientras queden pendientes que avancen. */
export async function drainWithBackoff(queue: OfflineQueue, o: DrainOptions = {}): Promise<FlushResult> {
  const sleep = o.sleep ?? defaultSleep
  const maxRounds = o.maxRounds ?? DEFAULT_MAX_ATTEMPTS
  let last = await queue.flush()
  for (let round = 1; round < maxRounds && last.remaining > 0; round++) {
    await sleep(retryDelayMs(round, o.baseMs, o.capMs))
    const next = await queue.flush()
    last = { sent: [...last.sent, ...next.sent], review: [...last.review, ...next.review], remaining: next.remaining }
  }
  return last
}
