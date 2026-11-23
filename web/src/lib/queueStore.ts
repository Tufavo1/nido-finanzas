// Copyright (c) 2026 Dinovance
import type { QueueItem } from './offlineQueue'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function isItem(v: unknown): v is QueueItem {
  if (!isRecord(v) || !isRecord(v['payload'])) return false
  const p = v['payload']
  return (
    typeof v['id'] === 'string' && typeof v['createdAt'] === 'number' && typeof v['attempts'] === 'number' && (v['status'] === 'pending' || v['status'] === 'review') &&
    typeof p['amount'] === 'number' && typeof p['note'] === 'string' && typeof p['spent_on'] === 'string' && typeof p['shared'] === 'boolean' && typeof p['paid_by'] === 'string'
  )
}

/** Lee la cola guardada (frontera): descarta lo que no tenga la forma exacta y nunca lanza. */
export function parseQueue(raw: string | null): QueueItem[] {
  try {
    const v: unknown = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(v) ? v.filter(isItem) : []
  } catch {
    return []
  }
}
