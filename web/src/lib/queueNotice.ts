// Copyright (c) 2026 Dinovance
import type { OfflineQueue, QueuePayload } from './offlineQueue'
import type { Notify } from '../components/Toast'

/** Deja el gasto en la cola para enviarlo solo y avisa con «Reintentar». false si la cola está llena. */
export async function enqueueWithNotice(queue: OfflineQueue, form: QueuePayload, notify: Notify): Promise<boolean> {
  const r = await queue.enqueue(form, Date.now())
  if (r.ok) notify('Sin conexión\nGuardé el gasto en tu teléfono y lo enviaré **solo** cuando vuelva internet.', 'warn', { label: 'Reintentar', onAction: () => void queue.flush() })
  else notify('No se pudo guardar el gasto\nHay demasiados gastos sin enviar. Conéctate a internet y vuelve a intentarlo.', 'error')
  return r.ok
}
