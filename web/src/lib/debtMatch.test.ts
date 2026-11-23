// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { chosenId, matchDebt, moveChoice, normalize, partnerOnlyCount, payableDebts } from './debtMatch'

const d = (id: string, name: string, archived = false) => ({ id, name, archived })

describe('matchDebt', () => {
  it('sin deudas activas: none (las archivadas no cuentan)', () => {
    expect(matchDebt('CMR Mastercard Premium', [])).toEqual({ kind: 'none' })
    expect(matchDebt('CMR', [d('1', 'CMR', true)])).toEqual({ kind: 'none' })
  })
  it('una coincidencia clara, sin importar tildes ni mayúsculas', () => {
    const r = matchDebt('CMR Mastercard Premium ·5766', [d('1', 'Tarjeta CMR Premium'), d('2', 'Crédito auto')])
    expect(r).toEqual({ kind: 'one', debt: d('1', 'Tarjeta CMR Premium') })
    expect(matchDebt('Crédito Falabella', [d('9', 'CREDITO FALABELLA'), d('8', 'Auto')])).toMatchObject({ kind: 'one' })
  })
  it('los últimos 4 dígitos desempatan', () => {
    const r = matchDebt('CMR Mastercard Premium ·5766', [d('1', 'CMR 1111'), d('2', 'CMR 5766')])
    expect(r).toEqual({ kind: 'one', debt: d('2', 'CMR 5766') })
  })
  it('varias igual de parecidas: lista para elegir', () => {
    const r = matchDebt('CMR Mastercard Premium', [d('1', 'CMR Premium papá'), d('2', 'CMR Premium mamá'), d('3', 'Auto')])
    expect(r.kind).toBe('choose')
    if (r.kind === 'choose') expect(r.debts.map((x) => x.id)).toEqual(['1', '2'])
  })
  it('ninguna clara pero hay deudas: lista con todas las activas', () => {
    const r = matchDebt('CMR Mastercard Premium', [d('1', 'Auto'), d('2', 'Casa'), d('3', 'Vieja', true)])
    expect(r.kind).toBe('choose')
    if (r.kind === 'choose') expect(r.debts.map((x) => x.id)).toEqual(['1', '2'])
  })
  it('sin cuenta: lista para elegir', () => {
    expect(matchDebt(null, [d('1', 'Auto')]).kind).toBe('choose')
  })
  it('palabras genéricas (banco, tarjeta) no cuentan como coincidencia', () => {
    expect(matchDebt('Tarjeta Banco X', [d('1', 'Tarjeta Banco Y')]).kind).toBe('choose')
  })
  it('normalize quita tildes y signos', () => {
    expect(normalize('Débito · Ñandú')).toBe('debito nandu')
  })
})

describe('opciones tipo radio', () => {
  const ds = [d('a', 'A'), d('b', 'B'), d('c', 'C')]
  it('sin elección, la más probable (primera) queda marcada; una elegida válida manda; una inválida se ignora', () => {
    expect(chosenId(undefined, ds)).toBe('a')
    expect(chosenId('c', ds)).toBe('c')
    expect(chosenId('zzz', ds)).toBe('a')
    expect(chosenId(undefined, [])).toBeNull()
  })
  it('flechas mueven con vuelta; otras teclas no', () => {
    expect(moveChoice(0, 'ArrowDown', 3)).toBe(1)
    expect(moveChoice(2, 'ArrowRight', 3)).toBe(0)
    expect(moveChoice(0, 'ArrowUp', 3)).toBe(2)
    expect(moveChoice(1, 'ArrowLeft', 3)).toBe(0)
    expect(moveChoice(1, 'Home', 3)).toBe(0)
    expect(moveChoice(1, 'End', 3)).toBe(2)
    expect(moveChoice(1, 'Enter', 3)).toBeNull()
    expect(moveChoice(0, 'ArrowDown', 0)).toBeNull()
  })
})

describe('deudas que se pueden pagar desde un aviso (propias o compartidas, nunca las personales de la pareja)', () => {
  const me = 'u-yo'
  const pareja = 'u-pareja'
  const debts = [
    { id: 'a', name: 'Banco Falabella · Tarjeta de crédito', owner_id: me },
    { id: 'b', name: 'CMR Mastercard Premium', owner_id: pareja },
    { id: 'c', name: 'Crédito de la casa', owner_id: null },
    { id: 'd', name: 'Préstamo viejo', owner_id: me, archived: true },
  ]

  it('deja solo las mías y las compartidas, con su etiqueta', () => {
    const r = payableDebts(debts, me)
    expect(r.map((x) => x.id)).toEqual(['a', 'c'])
    expect(r.map((x) => x.label)).toEqual(['Tuya', 'Compartida'])
  })

  it('cuenta las personales de la pareja que quedan fuera', () => {
    expect(partnerOnlyCount(debts, me)).toBe(1)
  })

  it('el emparejamiento por nombre nunca elige la deuda de la pareja aunque se llame igual', () => {
    const m = matchDebt('CMR Mastercard Premium', payableDebts(debts, me))
    expect(m.kind === 'one' ? m.debt.id : null).not.toBe('b')
  })

  it('sin dueño informado (datos viejos) se trata como compartida', () => {
    expect(payableDebts([{ id: 'x', name: 'Algo' }], me)[0]?.label).toBe('Compartida')
  })
})
