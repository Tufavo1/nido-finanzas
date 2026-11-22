// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { matchDebt, normalize } from './debtMatch'

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
