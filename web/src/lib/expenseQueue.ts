// Copyright (c) 2026 Dinovance
import { createOfflineQueue } from './offlineQueue'
import type { OfflineQueue, QueueItem, QueueStore } from './offlineQueue'
import { ContigoNative, isNativeApp } from './nativeBridge'
import { expenseRow } from './inbox'
import { parseQueue } from './queueStore'
import { supabase } from './supabase'

/** En la app la cola vive en el almacén cifrado del teléfono; en la web solo en memoria (no se guarda nada en el navegador). */
function createStore(householdId: string): QueueStore {
  if (!isNativeApp()) {
    let items: QueueItem[] = []
    return { load: async () => items, save: async (next) => void (items = next) }
  }
  const key = `queue-${householdId}`
  return {
    load: async () => parseQueue((await ContigoNative.secureGet({ key })).value),
    save: (items) => ContigoNative.secureSet({ key, value: JSON.stringify(items) }),
  }
}

/** Cola de gastos sin enviar: cada uno lleva su id idempotente, así reenviar nunca lo duplica. */
export function createExpenseQueue(householdId: string, meId: string): OfflineQueue {
  return createOfflineQueue({
    store: createStore(householdId),
    send: async ({ id, payload }) => {
      if (!payload.category_id) return { error: { message: 'Falta la categoría', code: '23502' } }
      const r = await supabase.from('expenses').insert(expenseRow(householdId, id, payload, meId))
      return { error: r.error, status: r.status }
    },
  })
}
