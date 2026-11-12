import { describe, expect, it } from 'vitest'
import { ageOn, birthError, lifeStageTip } from './birth'
import { adviceFor } from './profile'

const NOW = new Date(2026, 10, 11) // 11 de noviembre de 2026

describe('ageOn', () => {
  it('cuenta los años cumplidos', () => {
    expect(ageOn('1990-05-20', NOW)).toBe(36)
  })
  it('el cumpleaños cuenta desde el mismo día, no antes', () => {
    expect(ageOn('2008-11-11', NOW)).toBe(18)
    expect(ageOn('2008-11-12', NOW)).toBe(17)
  })
  it('quien nació un 29 de febrero cumple el 1 de marzo en años normales', () => {
    expect(ageOn('2008-02-29', new Date(2026, 1, 28))).toBe(17)
    expect(ageOn('2008-02-29', new Date(2026, 2, 1))).toBe(18)
  })
  it('una fecha que no existe o mal escrita no tiene edad', () => {
    for (const bad of ['', '2026-02-30', '1990-13-01', '20/05/1990', 'hola']) expect(ageOn(bad, NOW), bad).toBeNull()
  })
})

describe('birthError', () => {
  it('acepta a una persona adulta', () => expect(birthError('1990-05-20', NOW)).toBeNull())
  it('pide la fecha si falta', () => expect(birthError('', NOW)).toBe('Escribe tu fecha de nacimiento'))
  it('rechaza fechas que no existen', () => expect(birthError('2026-02-30', NOW)).toBe('Esa fecha no existe'))
  it('rechaza fechas futuras', () => expect(birthError('2030-01-01', NOW)).toBe('La fecha no puede ser futura'))
  it('rechaza a menores de 18 años', () => {
    expect(birthError('2008-11-12', NOW)).toBe('Contigo es para personas mayores de 18 años')
    expect(birthError('2008-11-11', NOW)).toBeNull()
  })
  it('rechaza edades imposibles', () => expect(birthError('1900-01-01', NOW)).toBe('Revisa el año de nacimiento'))
})

describe('lifeStageTip', () => {
  it('da un consejo distinto según la etapa', () => {
    expect(lifeStageTip(24)).toContain('joven')
    expect(lifeStageTip(40)).toBeNull()
    expect(lifeStageTip(55)).toContain('deudas')
  })
})

describe('adviceFor con fecha de nacimiento', () => {
  it('suma el consejo de la etapa de vida', () => {
    const a = adviceFor({ profession: '', employment: 'dependiente', dependents: 0, birth_date: '2002-01-01' }, NOW)
    expect(a.tips.some((t) => t.includes('joven'))).toBe(true)
  })
  it('sin fecha sigue funcionando igual', () => {
    const a = adviceFor({ profession: '', employment: 'dependiente', dependents: 0 }, NOW)
    expect(a.tips).toEqual(['Cuéntanos tu profesión y situación laboral para darte consejos a tu medida.'])
  })
})
