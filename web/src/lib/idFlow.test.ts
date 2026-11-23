import { describe, expect, it } from 'vitest'
import { draftExpenseId } from './draftExpenseId'
import { formWithId } from './inbox'
import { createOfflineQueue } from './offlineQueue'
import type { QueueItem } from './offlineQueue'
import { enqueueWithNotice } from './queueNotice'

// H-02: el mismo id viaja desde el borrador del teléfono hasta el reenvío; «ya existía» (23505) cuenta como éxito.
const NATIVE_ID = '3f2b8c1e-0000-4000-8000-0000000000aa'
const FORM = { amount: 6_500, note: 'Cafe Demo Norte', spent_on: '2026-11-21', shared: true, paid_by: 'u1', category_id: 'c1' }

function setup(results: ({ code?: string; message: string } | null)[]) {
  let items: QueueItem[] = []
  const sentIds: string[] = []
  const toasts: string[] = []
  const queue = createOfflineQueue({
    store: { load: async () => items, save: async (n) => void (items = n) },
    send: async ({ id }) => {
      sentIds.push(id)
      return { error: results.shift() ?? null }
    },
  })
  return { queue, sentIds, toasts, notify: (t: string) => void toasts.push(t) }
}

describe('el id del gasto desde el borrador hasta el reenvío', () => {
  it('formWithId agrega el id determinista del borrador', () => {
    expect(formWithId(FORM, NATIVE_ID)).toEqual({ ...FORM, id: draftExpenseId(NATIVE_ID) })
  })

  it('la cola envía con el id del borrador, no con uno inventado', async () => {
    const { queue, sentIds, notify } = setup([null])
    expect(await enqueueWithNotice(queue, formWithId(FORM, NATIVE_ID), notify)).toBe(true)
    await queue.flush()
    expect(sentIds).toEqual([draftExpenseId(NATIVE_ID)])
  })

  it('si el primer envío sí llegó pero se perdió la respuesta, el reenvío con el mismo id (23505) cuenta como éxito y no duplica', async () => {
    const { queue, sentIds, notify } = setup([{ code: '23505', message: 'duplicate key value violates unique constraint "expenses_pkey"' }])
    await enqueueWithNotice(queue, formWithId(FORM, NATIVE_ID), notify)
    const r = await queue.flush()
    expect(r.sent).toEqual([draftExpenseId(NATIVE_ID)])
    expect(r.remaining).toBe(0)
    expect(sentIds).toEqual([draftExpenseId(NATIVE_ID)])
  })
})
