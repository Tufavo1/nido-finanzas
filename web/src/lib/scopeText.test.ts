import { describe, expect, it } from 'vitest'
import { cardLimitText, latestHint, otherName, totalOwnerText } from './scopeText'

const members = [
  { user_id: 'yo', display_name: 'Jorge' },
  { user_id: 'isi', display_name: 'Isidora' },
]

describe('otherName: de quién se habla según el alcance', () => {
  it('hogar y yo no son otra persona', () => {
    expect(otherName('all', 'yo', members)).toBeNull()
    expect(otherName('yo', 'yo', members)).toBeNull()
  })
  it('la pareja es otra persona', () => expect(otherName('isi', 'yo', members)).toBe('Isidora'))
  it('un alcance desconocido tampoco es otra persona', () => expect(otherName('zzz', 'yo', members)).toBeNull())
})

describe('textos que dependen del alcance', () => {
  it('Yo: segunda persona; Hogar: el hogar; pareja: tercera persona', () => {
    expect(totalOwnerText('all', null)).toBe('gastos del hogar')
    expect(totalOwnerText('yo', null)).toBe('tu parte')
    expect(totalOwnerText('isi', 'Isidora')).toBe('la parte de Isidora')
    expect(latestHint('all', null)).toBe('Lo último que anotaron')
    expect(latestHint('yo', null)).toBe('Lo último que te corresponde')
    expect(latestHint('isi', 'Isidora')).toBe('Lo último que le corresponde a Isidora')
  })
  it('cupo de tarjeta: te pasaste / te quedan según de quién se hable', () => {
    expect(cardLimitText({ over: 0, free: 50_000, pct: 80 }, null)).toBe('Te quedan $50.000 de cupo (80 % usado).')
    expect(cardLimitText({ over: 12_990, free: 0, pct: 110 }, null)).toBe('Te pasaste del cupo por $12.990.')
    expect(cardLimitText({ over: 0, free: 50_000, pct: 80 }, 'Isidora')).toBe('Le quedan $50.000 de cupo a Isidora (80 % usado).')
    expect(cardLimitText({ over: 12_990, free: 0, pct: 110 }, 'Isidora')).toBe('Isidora se pasó del cupo por $12.990.')
  })
})
