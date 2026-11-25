import { describe, expect, it } from 'vitest'
import { debtEndShort, debtEndTile } from './debtText'

describe('plazo de una deuda en la lista', () => {
  it('cuota: faltan meses o sin fecha', () => {
    expect(debtEndShort('consumo', 1, false)).toBe('Faltan ~1 mes')
    expect(debtEndShort('consumo', 14, false)).toBe('Faltan ~14 meses')
    expect(debtEndShort('consumo', null, false)).toBe('Sin fecha de término')
    expect(debtEndShort('consumo', 3, true)).toBe('Saldada 🎉')
  })
  it('tarjeta: no tiene fecha de término (lo usado se paga cuando se quiera)', () => {
    expect(debtEndShort('tarjeta', null, false)).toBe('Cupo usado')
    expect(debtEndShort('tarjeta', null, true)).toBe('Saldada 🎉')
  })
})

describe('«Terminan de pagar» del detalle', () => {
  it('la tarjeta no lo muestra', () => expect(debtEndTile('tarjeta', null, false)).toBeNull())
  it('una cuota sí', () => {
    expect(debtEndTile('consumo', 1, false)).toBe('En ~1 mes')
    expect(debtEndTile('consumo', 5, false)).toBe('En ~5 meses')
    expect(debtEndTile('consumo', null, false)).toBe('Sin fecha')
    expect(debtEndTile('consumo', 5, true)).toBe('Saldada 🎉')
  })
})
