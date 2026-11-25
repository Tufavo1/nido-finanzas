// Copyright (c) 2026 Dinovance
// Pagar una deuda: el monto sugerido es la cuota (sin pasar del saldo) y «Pagar todo» es el saldo. Una sola fórmula para Registrar y Deudas.
import { describe, expect, it } from 'vitest'
import { debtPayChips } from './finance'

describe('debtPayChips', () => {
  it('cuota 100.000 y saldo 1.056.339: Cuota $100.000 y Pagar todo $1.056.339', () => {
    expect(debtPayChips(100_000, 1_056_339)).toEqual({ fee: 100_000, all: 1_056_339 })
  })
  it('la cuota nunca pasa del saldo: cuota 400.000 con saldo 70.000 sugiere 70.000', () => {
    expect(debtPayChips(400_000, 70_000)).toEqual({ fee: 70_000, all: 70_000 })
  })
  it('sin cuota anotada no hay chip de cuota', () => {
    expect(debtPayChips(0, 50_000)).toEqual({ fee: null, all: 50_000 })
  })
})
