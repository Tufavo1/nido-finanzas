import { describe, expect, it } from 'vitest'
import { digitsOnly, MAX_AMOUNT_DIGITS, monthYear } from './ui'

describe('monthYear', () => {
  it('mes en minúscula con «de»', () => {
    expect(monthYear(new Date(2026, 10, 1))).toBe('noviembre de 2026')
    expect(monthYear(new Date(2027, 0, 15))).toBe('enero de 2027')
  })
})

describe('digitsOnly: un solo criterio de largo para los montos', () => {
  it('por defecto corta en MAX_AMOUNT_DIGITS (9)', () => {
    expect(MAX_AMOUNT_DIGITS).toBe(9)
    expect(digitsOnly('1234567890123')).toBe('123456789')
  })
  it('acepta otro tope y quita todo lo que no sea dígito', () => {
    expect(digitsOnly('$1.234.567.890.123', 10)).toBe('1234567890')
    expect(digitsOnly('a1b2')).toBe('12')
  })
})
