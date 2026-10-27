import { describe, expect, it } from 'vitest'
import { compareDebt, freshness, monthlyRange, offersFor, productForDebt } from './bankRates'
import { BANKS } from './bankData'

const NOW = new Date(2026, 9, 26)

describe('Tipo de producto de una deuda', () => {
  it('tarjeta, créditos y préstamos', () => {
    expect(productForDebt({ kind: 'tarjeta', name: 'CMR' })).toBe('tarjeta')
    expect(productForDebt({ kind: 'credito', name: 'Auto' })).toBe('consumo')
    expect(productForDebt({ kind: 'prestamo', name: 'Banco Estado · Crédito de consumo' })).toBe('consumo')
    expect(productForDebt({ kind: 'prestamo', name: 'Préstamo de Mamá' })).toBeNull()
    expect(productForDebt({ kind: 'otro', name: 'Varios' })).toBeNull()
  })
  it('por el nombre reconoce el hipotecario', () => {
    expect(productForDebt({ kind: 'credito', name: 'Dividendo casa' })).toBe('hipotecario')
  })
})

describe('Tasas que publican los bancos', () => {
  it('una tasa anual se pasa a mensual dividiéndola en 12', () => {
    const santander = BANKS.find((b) => b.id === 'santander')!.rates.find((r) => r.product === 'consumo')!
    expect(monthlyRange(santander).max).toBeCloseTo(3.4)
  })

  it('para un monto usa solo el tramo que le toca', () => {
    const o = offersFor('consumo', 500_000, NOW)
    const f = o.find((x) => x.bank.id === 'falabella')!
    expect(f.entries).toHaveLength(1)
    expect(f.range).toEqual({ min: 1.63, max: 3.42 })
    const g = offersFor('consumo', 3_500_000, NOW).find((x) => x.bank.id === 'falabella')!
    expect(g.range.min).toBe(1.26)
  })

  it('si el monto no cae en ningún tramo muestra todos', () => {
    const f = offersFor('consumo', 2_000_000, NOW).find((x) => x.bank.id === 'falabella')!
    expect(f.entries).toHaveLength(2)
  })

  it('un banco que solo publica el máximo se marca como tal', () => {
    const s = offersFor('consumo', 500_000, NOW).find((x) => x.bank.id === 'santander')!
    expect(s.capOnly).toBe(true)
    expect(s.range.min).toBeNull()
  })

  it('avisa cuando el dato es viejo o no trae fecha', () => {
    expect(freshness('2026-10-15', NOW)).toBe('vigente')
    expect(freshness('2026-02-01', NOW)).toBe('viejo')
    expect(freshness(null, NOW)).toBe('sin-fecha')
    expect(offersFor('hipotecario', undefined, NOW).find((x) => x.bank.id === 'falabella')?.freshness).toBe('viejo')
    expect(offersFor('consumo', undefined, NOW).find((x) => x.bank.id === 'santander')?.freshness).toBe('sin-fecha')
  })
})

describe('Tu deuda frente a los bancos', () => {
  const base = { product: 'tarjeta' as const, amount: 1_000_000, payment: 100_000, now: NOW }

  it('más cara que el máximo de todos', () => {
    expect(compareDebt({ ...base, rate: 5 })?.verdict).toBe('sobre')
  })
  it('entre lo más bajo y lo más alto', () => {
    const c = compareDebt({ ...base, rate: 3 })
    expect(c?.verdict).toBe('dentro')
    // Para $1.000.000 Falabella solo publica el máximo; el mínimo lo da Santander (26 % anual ≈ 2,17 % al mes)
    expect(c?.lowest?.bank.id).toBe('santander')
    expect(c?.lowest?.rate).toBeCloseTo(26 / 12)
    // Para $4.000.000 entra la oferta de Súper Avance de Falabella (2,15 % al mes)
    expect(compareDebt({ ...base, amount: 4_000_000, rate: 3 })?.lowest?.bank.id).toBe('falabella')
  })
  it('igual o más baja que lo mejor que publican', () => {
    const c = compareDebt({ ...base, rate: 1.9 })
    expect(c?.verdict).toBe('bajo')
    expect(c?.saving).toBeNull()
  })
  it('calcula cuánto interés se ahorraría con la tasa más baja', () => {
    const c = compareDebt({ ...base, rate: 3.4 })
    expect(c?.saving?.interest).toBeGreaterThan(0)
    expect(c?.saving?.months).toBeGreaterThanOrEqual(0)
  })
  it('un tope no cuenta como la tasa más baja a la que puedes llegar', () => {
    // En hipotecario Santander solo publica topes: la más baja es la de Falabella
    const c = compareDebt({ product: 'hipotecario', rate: 0.5, amount: 50_000_000, payment: 300_000, now: NOW })
    expect(c?.lowest?.bank.id).toBe('falabella')
  })
  it('sin tasa o en un producto sin comparación no opina', () => {
    expect(compareDebt({ ...base, rate: 0 })).toBeNull()
    expect(compareDebt({ ...base, product: 'linea', rate: 2 })).toBeNull()
  })
})
