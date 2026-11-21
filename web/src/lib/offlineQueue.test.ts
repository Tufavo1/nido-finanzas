import { describe, expect, it } from 'vitest'
import type { ExpenseDraft } from './candidates'
import type { WriteResult } from './idempotency'
import { createOfflineQueue, type QueueItem, type QueueStore } from './offlineQueue'

// RF-18: cola de gastos pendientes con id idempotente.

const draft = (amount: number, note = 'Gasto demo'): ExpenseDraft => ({
  amount,
  note,
  spent_on: '2026-11-14',
  shared: true,
  paid_by: 'user-1',
  category_id: null,
})
const ok: WriteResult = { error: null, status: 201 }
const dup: WriteResult = { error: { message: 'duplicate key value violates unique constraint "expenses_pkey"', code: '23505' }, status: 409 }
const network: WriteResult = { error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }
const invalid: WriteResult = { error: { message: 'new row violates check constraint "expenses_amount_check"', code: '23514' }, status: 400 }

function setup(script: (id: string, call: number) => WriteResult, opts: { maxItems?: number; maxAttempts?: number } = {}) {
  let saved: QueueItem[] = []
  const store: QueueStore = { load: async () => structuredClone(saved), save: async (i) => void (saved = structuredClone(i)) }
  const sent: { id: string; amount: number }[] = []
  const perId = new Map<string, number>()
  const queue = createOfflineQueue({
    store,
    send: async ({ id, payload }) => {
      sent.push({ id, amount: payload.amount })
      const n = (perId.get(id) ?? 0) + 1
      perId.set(id, n)
      return script(id, n)
    },
    ...opts,
  })
  return { queue, sent, store: () => saved }
}

describe('enqueue', () => {
  it('asigna un id UUID idempotente y deja el gasto pendiente (CA-18-1)', async () => {
    const { queue } = setup(() => ok)
    const r = await queue.enqueue(draft(4_500), 1_000)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const items = await queue.pending()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: r.id, status: 'pending', attempts: 0, createdAt: 1_000 })
  })

  it('cada gasto recibe un id distinto', async () => {
    const { queue } = setup(() => ok)
    const a = await queue.enqueue(draft(1), 1)
    const b = await queue.enqueue(draft(2), 2)
    expect(a.ok && b.ok && a.id !== b.id).toBe(true)
  })

  it('persiste en el almacén (sobrevive a cerrar la app, CA-18-4)', async () => {
    const { queue, store } = setup(() => ok)
    await queue.enqueue(draft(4_500), 1_000)
    expect(store()).toHaveLength(1)
  })

  it('respeta el límite de la cola y avisa que está llena', async () => {
    const { queue } = setup(() => ok, { maxItems: 2 })
    await queue.enqueue(draft(1), 1)
    await queue.enqueue(draft(2), 2)
    expect(await queue.enqueue(draft(3), 3)).toEqual({ ok: false, reason: 'full' })
    expect(await queue.pending()).toHaveLength(2)
  })

  it('el límite por defecto es 500', async () => {
    const { queue } = setup(() => ok)
    for (let i = 0; i < 500; i++) expect((await queue.enqueue(draft(i + 1), i)).ok).toBe(true)
    expect(await queue.enqueue(draft(501), 501)).toEqual({ ok: false, reason: 'full' })
  })
})

describe('flush', () => {
  it('envía en orden de creación y vacía la cola (CA-18-2)', async () => {
    const { queue, sent } = setup(() => ok)
    const b = await queue.enqueue(draft(200), 2_000)
    const a = await queue.enqueue(draft(100), 1_000)
    const r = await queue.flush()
    expect(sent.map((s) => s.amount)).toEqual([100, 200])
    expect(r.sent).toEqual([a.ok ? a.id : '', b.ok ? b.id : ''])
    expect(r.remaining).toBe(0)
    expect(await queue.pending()).toHaveLength(0)
  })

  it('el código 23505 sobre _pkey cuenta como enviado y no duplica', async () => {
    const { queue } = setup(() => dup)
    const a = await queue.enqueue(draft(100), 1)
    const r = await queue.flush()
    expect(r.sent).toEqual([a.ok ? a.id : ''])
    expect(await queue.pending()).toHaveLength(0)
  })

  it('repetir el envío no vuelve a mandar lo que ya se guardó', async () => {
    const { queue, sent } = setup(() => ok)
    await queue.enqueue(draft(100), 1)
    await queue.flush()
    await queue.flush()
    expect(sent).toHaveLength(1)
  })

  it('un reintento usa el mismo id (por eso el servidor no duplica)', async () => {
    const { queue, sent } = setup((_id, call) => (call === 1 ? network : ok))
    await queue.enqueue(draft(100), 1)
    await queue.flush()
    await queue.flush()
    expect(sent).toHaveLength(2)
    expect(sent[0]!.id).toBe(sent[1]!.id)
    expect(await queue.pending()).toHaveLength(0)
  })

  it('una falla de red deja el gasto pendiente, cuenta el intento y corta el envío para no romper el orden', async () => {
    const { queue, sent } = setup(() => network)
    await queue.enqueue(draft(100), 1)
    await queue.enqueue(draft(200), 2)
    const r = await queue.flush()
    expect(sent).toHaveLength(1) // el segundo no se intenta
    expect(r.sent).toEqual([])
    expect(r.remaining).toBe(2)
    const items = await queue.pending()
    expect(items[0]).toMatchObject({ status: 'pending', attempts: 1 })
    expect(items[1]).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('tras el máximo de intentos queda «revisar» y ya no se reintenta (por defecto 5)', async () => {
    const { queue, sent } = setup(() => network)
    await queue.enqueue(draft(100), 1)
    for (let i = 0; i < 8; i++) await queue.flush()
    expect(sent).toHaveLength(5)
    const items = await queue.pending()
    expect(items[0]).toMatchObject({ status: 'review', attempts: 5 })
  })

  it('el máximo de intentos es configurable', async () => {
    const { queue, sent } = setup(() => network, { maxAttempts: 2 })
    await queue.enqueue(draft(100), 1)
    for (let i = 0; i < 5; i++) await queue.flush()
    expect(sent).toHaveLength(2)
  })

  it('un error de validación pasa a «revisar» sin reintentar y no frena a los demás (CA-18-3)', async () => {
    const { queue, sent } = setup((_id) => ok)
    const bad = createOfflineQueue({
      store: { load: async () => [], save: async () => {} },
      send: async () => invalid,
    })
    await bad.enqueue(draft(-5), 1)
    const r0 = await bad.flush()
    await bad.flush()
    expect(r0.review).toHaveLength(1)
    expect((await bad.pending())[0]).toMatchObject({ status: 'review', attempts: 1 })

    // un inválido en medio no frena el siguiente
    let n = 0
    const mixed = createOfflineQueue({
      store: { load: async () => [], save: async () => {} },
      send: async () => (++n === 1 ? invalid : ok),
    })
    await mixed.enqueue(draft(-5), 1)
    await mixed.enqueue(draft(300), 2)
    const r = await mixed.flush()
    expect(r.review).toHaveLength(1)
    expect(r.sent).toHaveLength(1)
    expect(sent).toHaveLength(0)
    void queue
  })

  it('un gasto en «revisar» no se envía en los siguientes flush', async () => {
    let calls = 0
    const q = createOfflineQueue({
      store: { load: async () => [], save: async () => {} },
      send: async () => {
        calls++
        return invalid
      },
    })
    await q.enqueue(draft(1), 1)
    await q.flush()
    await q.flush()
    await q.flush()
    expect(calls).toBe(1)
  })
})
