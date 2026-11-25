import { describe, expect, it } from 'vitest'
import { decimalEs, money, pctText } from './format'

describe('M4 money()', () => {
  const sinEspacios = (s: string) => s.replace(/\s/g, '')
  it('formatea pesos chilenos', () => {
    expect(sinEspacios(money(12990))).toBe('$12.990')
  })
  it('un negativo lleva el signo delante del símbolo', () => {
    expect(sinEspacios(money(-12990))).toBe('-$12.990')
  })
  it('un redondeo a cero no muestra -$0', () => {
    expect(sinEspacios(money(-0.4))).toBe('$0')
  })
})

describe('decimalEs y pctText: coma decimal, sin ceros de más', () => {
  it('decimalEs usa coma y hasta 2 decimales', () => {
    expect(decimalEs(2.5)).toBe('2,5')
    expect(decimalEs(3.41)).toBe('3,41')
    expect(decimalEs(3)).toBe('3')
    expect(decimalEs(3.456)).toBe('3,46')
  })
  it('decimalEs puede fijar los decimales (meses de colchón)', () => {
    expect(decimalEs(2, 1, 1)).toBe('2,0')
    expect(decimalEs(2.34, 1, 1)).toBe('2,3')
  })
  it('pctText pone el espacio antes del %', () => {
    expect(pctText(3.41)).toBe('3,41 %')
    expect(pctText(12)).toBe('12 %')
    expect(pctText(3.5, 2, 2)).toBe('3,50 %')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { santiagoDay, todayISO } from './format'
import { stamp } from './backup'

describe('la fecha de «hoy» sale de America/Santiago, sin importar la zona del aparato', () => {
  it('a las 23:30 del 23-11 en Santiago (02:30 UTC del 24) el día es el 23', () => {
    expect(santiagoDay(new Date('2026-11-24T02:30:00Z'))).toBe('2026-11-23')
    expect(stamp(new Date('2026-11-24T02:30:00Z'))).toBe('2026-11-23')
  })
  it('en invierno (UTC-4) y a mediodía no cambia el día', () => {
    expect(santiagoDay(new Date('2026-07-10T16:00:00Z'))).toBe('2026-07-10')
    expect(santiagoDay(new Date('2026-07-11T03:30:00Z'))).toBe('2026-07-10')
  })
  it('todayISO tiene formato AAAA-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('el saldo informado de una tarjeta nueva usa la misma fecha de Santiago (no toLocaleDateString)', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'DebtGuidedForm.tsx'), 'utf8')
    expect(src).not.toContain('toLocaleDateString')
    expect(src).toContain('reported_at: todayISO()')
  })
})
