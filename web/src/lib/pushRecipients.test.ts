// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
// Logica pura de la funcion `notify` (Deno no esta instalado aqui: se prueba el modulo puro desde vitest).
import { BIG_SPEND_TITLE, bigSpendBody, splitRecipients } from '../../../supabase/functions/notify/recipients'

const pref = (user_id: string, enabled: boolean, threshold_clp: number | string = 50_000) => ({ user_id, enabled, threshold_clp })

describe('splitRecipients (aviso de gasto mayor)', () => {
  it('sin preferencia o apagada: aviso normal (apagado por defecto)', () => {
    expect(splitRecipients(['a', 'b'], [pref('b', false)], 900_000)).toEqual({ major: [], normal: ['a', 'b'] })
  })
  it('activada y gasto >= umbral (inclusivo): gasto mayor; menor: normal', () => {
    expect(splitRecipients(['a'], [pref('a', true, 50_000)], 50_000).major).toEqual(['a'])
    expect(splitRecipients(['a'], [pref('a', true, 50_000)], 49_999)).toEqual({ major: [], normal: ['a'] })
  })
  it('cada destinatario usa SU umbral', () => {
    const r = splitRecipients(['a', 'b'], [pref('a', true, 20_000), pref('b', true, 100_000)], 60_000)
    expect(r).toEqual({ major: ['a'], normal: ['b'] })
  })
  it('el umbral que llega como texto (bigint) funciona y uno invalido no activa nada', () => {
    expect(splitRecipients(['a'], [pref('a', true, '30000')], 30_000).major).toEqual(['a'])
    expect(splitRecipients(['a'], [pref('a', true, 'x')], 1e9).major).toEqual([])
    expect(splitRecipients(['a'], [pref('a', true, 0)], 5).major).toEqual([])
    expect(splitRecipients(['a'], [pref('a', true)], Number.NaN).major).toEqual([])
  })
  it('sin destinatarios o repetidos: cada uno una sola vez; preferencias de quien no es destinatario se ignoran', () => {
    expect(splitRecipients([], [pref('a', true)], 1e6)).toEqual({ major: [], normal: [] })
    expect(splitRecipients(['a', 'a'], [pref('a', true), pref('z', true)], 1e6)).toEqual({ major: ['a'], normal: [] })
  })
  it('titulo y cuerpo completos: monto y categoria', () => {
    expect(BIG_SPEND_TITLE).toBe('Tu pareja hizo un gasto mayor')
    expect(bigSpendBody('$120.000', 'Supermercado', true)).toBe('$120.000 en Supermercado')
    expect(bigSpendBody('$120.000', null, false)).toBe('$120.000 en una categoría (personal)')
  })
})
