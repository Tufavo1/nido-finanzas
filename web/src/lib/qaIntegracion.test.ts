// Copyright (c) 2026 Dinovance
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ExpenseDraft } from './candidates'
import { parseExpenseLink } from './deepLink'
import { draftExpenseId } from './draftExpenseId'
import type { WriteResult } from './idempotency'
import { createOfflineQueue, type QueueItem } from './offlineQueue'

// QA adversarial (hallazgos de docs/mobile/qa-integracion.md). Cada prueba FALLA hoy por la razón de su nombre.
const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const draft: ExpenseDraft = { amount: 12_990, note: 'Almacen Demo Spa', spent_on: '2026-11-14', shared: true, paid_by: 'u1', category_id: 'c1' }
const ok: WriteResult = { error: null, status: 201 }
const dup: WriteResult = { error: { message: 'duplicate key value violates unique constraint "expenses_pkey"', code: '23505' }, status: 409 }

describe('H-02 (b) idempotencia de extremo a extremo con la cola', () => {
  function rig() {
    let saved: QueueItem[] = []
    const sentIds: string[] = []
    const rows = new Set<string>() // lo que haría la base: un id, una fila
    const queue = createOfflineQueue({
      store: { load: async () => structuredClone(saved), save: async (i) => void (saved = structuredClone(i)) },
      send: async ({ id }) => {
        sentIds.push(id)
        if (rows.has(id)) return dup
        rows.add(id)
        return ok
      },
    })
    return { queue, rows, sentIds }
  }

  it('si el gasto ya se guardó con el id X (se perdió la respuesta), encolarlo con ese mismo id no crea otra fila', async () => {
    const { queue, rows } = rig()
    rows.add('11111111-2222-4333-8444-555555555555') // el primer envío SÍ llegó al servidor
    const r = await queue.enqueue({ ...draft, id: '11111111-2222-4333-8444-555555555555' } as ExpenseDraft, 1)
    expect(r.ok && r.id).toBe('11111111-2222-4333-8444-555555555555')
    await queue.flush()
    expect(rows.size).toBe(1) // hoy enqueue inventa otro id y la base termina con 2 filas
  })

  it('el id que se envía desde la cola es el que trae el gasto', async () => {
    const { queue, sentIds } = rig()
    await queue.enqueue({ ...draft, id: '99999999-2222-4333-8444-555555555555' } as ExpenseDraft, 1)
    await queue.flush()
    expect(sentIds).toEqual(['99999999-2222-4333-8444-555555555555'])
  })

  it('reenviar el mismo id dos veces (23505 = éxito) deja una sola fila y la cola vacía', async () => {
    const { queue, rows } = rig()
    const r = await queue.enqueue(draft, 1)
    if (!r.ok) throw new Error('cola llena')
    rows.add(r.id) // la respuesta se perdió pero el servidor guardó
    const f = await queue.flush()
    expect(f.sent).toEqual([r.id])
    expect(rows.size).toBe(1)
    expect((await queue.pending()).length).toBe(0)
  })
})

describe('H-03 id del gasto derivado del borrador nativo (sobrevive a reiniciar la app)', () => {
  it('el mismo borrador siempre da el mismo id con forma de UUID', () => {
    const a = draftExpenseId('3f2b8c1e-0000-4000-8000-000000000001')
    expect(a).toBe(draftExpenseId('3f2b8c1e-0000-4000-8000-000000000001'))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('borradores distintos dan ids distintos', () => {
    expect(draftExpenseId('3f2b8c1e-0000-4000-8000-000000000001')).not.toBe(draftExpenseId('3f2b8c1e-0000-4000-8000-000000000002'))
  })
  it('useDetected usa ese id en vez de un Map en memoria (que se pierde al reiniciar)', () => {
    const s = src('./useDetected.ts')
    expect(s).toMatch(/draftExpenseId/)
    expect(s).not.toMatch(/ids\.current\.set/)
  })
})

describe('H-09 (i) enlace profundo: caracteres de dirección e invisibles (segunda capa TypeScript)', () => {
  const NOW = new Date(2026, 10, 21)
  it.each([
    ['U+202E invierte el texto', 'Kiosco%E2%80%AEoicsoiK'],
    ['U+200B ancho cero', 'Kiosco%E2%80%8BDemo'],
    ['U+2066 aislamiento bidi', '%E2%81%A6Demo%E2%81%A9'],
    ['U+FEFF', 'Kiosco%EF%BB%BFDemo'],
    ['U+2028 separador de línea', '%E2%80%A8Demo'],
  ])('rechaza el comercio con %s', (_n, enc) => {
    expect(parseExpenseLink(`nido://gasto?monto=1000&comercio=${enc}`, NOW).ok).toBe(false)
  })
})

describe('H-08 (h) registros sin datos: console.error no recibe el error crudo en el flujo de captura', () => {
  // Un error de la base (PostgREST) puede traer «details» con la fila completa (monto y comercio). Registrar solo el tipo.
  const files = ['useDetected.ts', 'useExpenseQueue.ts', 'useCaptureConfig.ts', 'useCaptureStatus.ts', '../components/ConfirmExpense.tsx', '../components/DetectedInbox.tsx', '../components/CaptureSettings.tsx', '../components/CaptureAppsPicker.tsx']
  it('ninguna llamada console.* recibe una variable de error sin pasar por toAppError(...).kind', () => {
    const raw: string[] = []
    for (const f of files) {
      src(f).split('\n').forEach((line, i) => {
        if (/console\.(error|warn)\(\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/.test(line)) raw.push(`${f.replace('../', '')}:${i + 1}`)
      })
    }
    expect(raw).toEqual([])
  })
})
