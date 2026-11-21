// Copyright (c) 2026 Dinovance
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createExpenseQueue } from './expenseQueue'
import { drainWithBackoff } from './offlineQueue'
import type { OfflineQueue } from './offlineQueue'
import { useAppResume } from './useAppResume'
import type { Notify } from '../components/Toast'
import { logError } from './safeLog'

/** Cola de gastos pendientes del hogar: se vacía al abrir, al volver la app a primer plano y cuando regresa internet. */
export function useExpenseQueue(householdId: string, meId: string, afterSent: () => Promise<void>, notify: Notify): OfflineQueue {
  const queue = useMemo(() => createExpenseQueue(householdId, meId), [householdId, meId])

  const after = useRef(afterSent)
  useEffect(() => {
    after.current = afterSent
  })

  const drain = useCallback(async () => {
    try {
      const r = await drainWithBackoff(queue)
      if (r.sent.length > 0) {
        await after.current()
        notify(`Gastos enviados\nSe enviaron **${r.sent.length}** ${r.sent.length === 1 ? 'gasto guardado' : 'gastos guardados'} sin conexión.`, 'success')
      }
      if (r.review.length > 0) notify('Un gasto necesita revisión\nNo se pudo enviar; revisa que tenga categoría y monto.', 'warn')
    } catch (e) {
      logError(e, 'useExpenseQueue')
    }
  }, [queue, notify])

  useEffect(() => {
    const run = () => void drain()
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [drain])
  useAppResume(() => void drain())
  return queue
}
