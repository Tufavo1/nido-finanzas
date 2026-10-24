import { describe, expect, it } from 'vitest'
import { fetchAllPages } from './paging'

const source = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }))
const pager = (rows: { id: number }[]) => (from: number, to: number) =>
  Promise.resolve({ data: rows.slice(from, to + 1), error: null })

describe('fetchAllPages', () => {
  it('junta más de 1.000 filas sin perder ni repetir', async () => {
    const { data, error } = await fetchAllPages(pager(source(2500)))
    expect(error).toBeNull()
    expect(data).toHaveLength(2500)
    expect(new Set(data?.map((r) => r.id)).size).toBe(2500)
  })
  it('con exactamente 1.000 filas pide una página más y termina', async () => {
    const { data } = await fetchAllPages(pager(source(1000)))
    expect(data).toHaveLength(1000)
  })
  it('devuelve el error si una página falla', async () => {
    const err = { message: 'boom', code: 'X' } as never
    const { data, error } = await fetchAllPages(() => Promise.resolve({ data: null, error: err }))
    expect(data).toBeNull()
    expect(error).toBe(err)
  })
})
