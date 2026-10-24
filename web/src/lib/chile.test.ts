import { describe, expect, it } from 'vitest'
import { calcularLiquido, impuestoUnico } from './chile'

describe('impuestoUnico (tabla de noviembre de 2026, Circular 39 del SII)', () => {
  it('hasta 13,5 UTM está exento', () => {
    expect(impuestoUnico(0)).toBe(0)
    expect(impuestoUnico(977_940)).toBe(0)
  })
  it('un peso sobre el primer tramo casi no paga', () => {
    expect(impuestoUnico(977_941)).toBe(0)
  })
  it('usa la tasa y la rebaja del tramo', () => {
    expect(impuestoUnico(3_000_000)).toBe(113_954) // 8 % menos $126.045,60
    expect(impuestoUnico(30_000_000)).toBe(9_187_879) // 40 % menos $2.812.120,80
  })
})

describe('calcularLiquido', () => {
  const total = (r: ReturnType<typeof calcularLiquido>) => r.descuentos.reduce((s, d) => s + d.monto, 0)

  it('$1.000.000 con AFP Uno: exento de impuesto', () => {
    const r = calcularLiquido({ bruto: 1_000_000, contrato: 'indefinido', afp: 'uno' })
    expect(r.descuentos.map((d) => [d.key, d.monto])).toEqual([
      ['afp', 100_000],
      ['comision', 4_600],
      ['salud', 70_000],
      ['cesantia', 6_000],
      ['impuesto', 0],
    ])
    expect(r.liquido).toBe(819_400)
  })

  it('$2.000.000 con AFP Modelo: ya paga impuesto', () => {
    const r = calcularLiquido({ bruto: 2_000_000, contrato: 'indefinido', afp: 'modelo' })
    expect(r.descuentos.find((d) => d.key === 'impuesto')?.monto).toBe(26_338)
    expect(r.liquido).toBe(1_610_062)
  })

  it('sobre el tope imponible solo se cotiza hasta el tope', () => {
    const r = calcularLiquido({ bruto: 5_000_000, contrato: 'indefinido', afp: 'habitat' })
    expect(r.sobreTope).toBe(true)
    expect(r.descuentos.find((d) => d.key === 'afp')?.monto).toBe(370_710) // 10 % de 90 UF
    expect(r.liquido).toBe(4_038_452)
  })

  it('plazo fijo no paga seguro de cesantía', () => {
    const r = calcularLiquido({ bruto: 1_000_000, contrato: 'plazo_fijo', afp: 'uno' })
    expect(r.descuentos.some((d) => d.key === 'cesantia')).toBe(false)
    expect(r.liquido).toBe(825_400)
  })

  it('honorarios: solo la retención del año', () => {
    const r = calcularLiquido({ bruto: 1_000_000, contrato: 'honorarios', afp: 'uno' })
    expect(r.descuentos).toEqual([{ key: 'retencion', label: expect.stringContaining('15,25'), monto: 152_500 }])
    expect(r.liquido).toBe(847_500)
  })

  it('bruto + descuentos cuadra siempre con el líquido', () => {
    for (const bruto of [0, 250_000, 800_000, 1_450_000, 3_900_000, 12_000_000]) {
      const r = calcularLiquido({ bruto, contrato: 'indefinido', afp: 'capital' })
      expect(r.liquido + total(r)).toBe(r.bruto)
      expect(r.liquido).toBeGreaterThanOrEqual(0)
    }
  })

  it('ignora montos negativos', () => {
    expect(calcularLiquido({ bruto: -5, contrato: 'indefinido', afp: 'uno' }).liquido).toBe(0)
  })
})
