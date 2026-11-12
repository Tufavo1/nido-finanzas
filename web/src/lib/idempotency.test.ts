import { describe, expect, it } from 'vitest'
import { isAlreadySaved, isTransient, newId, saveOnce } from './idempotency'

const noSleep = () => Promise.resolve()
const network = { error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }
const duplicate = { error: { message: 'duplicate key value violates unique constraint "expenses_pkey"', code: '23505' }, status: 409 }
const fine = { error: null, status: 201 }

describe('newId', () => {
  it('entrega un identificador único con formato UUID', () => {
    const a = newId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newId()).not.toBe(a)
  })
})

describe('isAlreadySaved', () => {
  it('un choque con el mismo identificador significa que el intento anterior sí se guardó', () => {
    expect(isAlreadySaved(duplicate)).toBe(true)
  })
  it('otro dato repetido (por ejemplo el nombre de una categoría) sigue siendo un error', () => {
    expect(isAlreadySaved({ error: { message: 'duplicate key value violates unique constraint "categories_household_id_name_key"', code: '23505' }, status: 409 })).toBe(false)
  })
  it('sin error no aplica', () => expect(isAlreadySaved(fine)).toBe(false))
})

describe('isTransient', () => {
  it('fallas de red, tiempo agotado y servidor caído son pasajeras', () => {
    expect(isTransient(network)).toBe(true)
    expect(isTransient({ error: { message: 'TimeoutError: sin respuesta', code: '' }, status: 0 })).toBe(true)
    for (const s of [502, 503, 504]) expect(isTransient({ error: { message: 'x' }, status: s }), String(s)).toBe(true)
  })
  it('un rechazo de la base no es pasajero', () => {
    expect(isTransient({ error: { message: 'new row violates row-level security policy', code: '42501' }, status: 403 })).toBe(false)
    expect(isTransient(fine)).toBe(false)
  })
})

describe('saveOnce', () => {
  it('guarda a la primera', async () => {
    let calls = 0
    const r = await saveOnce(async () => (calls++, fine), { sleep: noSleep })
    expect(r).toEqual({ ok: true, error: null })
    expect(calls).toBe(1)
  })

  it('si se cae la red reintenta, y si el primer intento sí había llegado no duplica', async () => {
    const answers = [network, duplicate]
    let calls = 0
    const r = await saveOnce(async () => answers[calls++]!, { sleep: noSleep })
    expect(r.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('no reintenta un rechazo real', async () => {
    let calls = 0
    const rejected = { error: { message: 'violates check constraint', code: '23514' }, status: 400 }
    const r = await saveOnce(async () => (calls++, rejected), { sleep: noSleep })
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('23514')
    expect(calls).toBe(1)
  })

  it('se rinde después de los reintentos y devuelve el error', async () => {
    let calls = 0
    const r = await saveOnce(async () => (calls++, network), { retries: 2, sleep: noSleep })
    expect(r.ok).toBe(false)
    expect(calls).toBe(3)
  })
})
