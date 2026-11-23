import { describe, expect, it } from 'vitest'
import { parseQueue } from './queueStore'

const item = { id: 'i1', payload: { amount: 1000, note: 'x', spent_on: '2026-11-21', shared: true, paid_by: 'u1', category_id: 'c1' }, createdAt: 5, attempts: 0, status: 'pending' }

describe('parseQueue', () => {
  it('lee la cola guardada y deja solo elementos con la forma exacta', () => {
    expect(parseQueue(JSON.stringify([item, { id: 3 }, null, { ...item, status: 'raro' }]))).toEqual([item])
  })
  it('vacío, dañado o de otro tipo: cola vacía, sin lanzar', () => {
    expect(parseQueue(null)).toEqual([])
    expect(parseQueue('{{')).toEqual([])
    expect(parseQueue('{"a":1}')).toEqual([])
  })
})
