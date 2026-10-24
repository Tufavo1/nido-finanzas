import { describe, expect, it } from 'vitest'
import { extraPaymentEffect, monthsToPayoff, payoffPlan } from './finance'

describe('payoffPlan: meses e intereses de una deuda', () => {
  it('$900.000 con cuota de $60.000 al 2,5 % mensual: 20 meses y ~$242.075 de interés', () => {
    expect(payoffPlan(900_000, 60_000, 2.5)).toEqual({ months: 20, interest: 242_075 })
  })
  it('sin interés es la división simple', () => {
    expect(payoffPlan(100_000, 20_000, 0)).toEqual({ months: 5, interest: 0 })
  })
  it('si la cuota no cubre el interés, nunca termina', () => {
    expect(payoffPlan(100_000, 2_000, 2)).toBeNull()
    expect(payoffPlan(100_000, 0, 2)).toBeNull()
  })
  it('sin deuda no hay nada que pagar', () => {
    expect(payoffPlan(0, 50_000, 3)).toEqual({ months: 0, interest: 0 })
  })
  it('coincide con los meses de monthsToPayoff', () => {
    for (const [b, p, r] of [[900_000, 60_000, 2.5], [500_000, 30_000, 1.5], [1_200_000, 80_000, 3], [100_000, 20_000, 0]]) {
      expect(payoffPlan(b, p, r)?.months).toBe(monthsToPayoff(b, p, r))
    }
  })
})

describe('extraPaymentEffect: qué pasa si pagas más', () => {
  it('+$50.000 al mes: 10 meses menos y ~$122.371 de interés menos', () => {
    const e = extraPaymentEffect(900_000, 60_000, 2.5, 50_000)
    expect(e?.withExtra).toEqual({ months: 10, interest: 119_704 })
    expect(e?.monthsSaved).toBe(10)
    expect(e?.interestSaved).toBe(242_075 - 119_704)
  })
  it('sin extra no hay comparación', () => {
    expect(extraPaymentEffect(900_000, 60_000, 2.5, 0)).toBeNull()
  })
  it('si hoy la cuota no avanza, lo extra la destraba y no se compara', () => {
    const e = extraPaymentEffect(100_000, 2_000, 2, 20_000)
    expect(e?.withExtra.months).toBeGreaterThan(0)
    expect(e?.monthsSaved).toBe(0)
  })
  it('si aun con lo extra no alcanza, no hay resultado', () => {
    expect(extraPaymentEffect(100_000, 1_000, 2, 500)).toBeNull()
  })
})
