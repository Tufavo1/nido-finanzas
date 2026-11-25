import { describe, expect, it } from 'vitest'
import { bodyGate } from './shellGate'

describe('bodyGate: sin internet Ajustes y Ayuda siguen abriendo', () => {
  it('con error de carga, Ajustes («security») y Ayuda abren su pantalla', () => {
    expect(bodyGate('security', true, false)).toBe('screen')
    expect(bodyGate('help', true, false)).toBe('screen')
  })
  it('con error de carga, las pantallas con datos del servidor muestran el error con Reintentar', () => {
    for (const t of ['home', 'expenses', 'money', 'goals', 'add', 'profile', 'inbox']) expect(bodyGate(t, true, false)).toBe('error')
  })
  it('cargando (sin error): esqueleto, también en Ajustes', () => {
    expect(bodyGate('home', false, false)).toBe('loading')
    expect(bodyGate('security', false, false)).toBe('loading')
  })
  it('listo: la pantalla', () => {
    expect(bodyGate('home', false, true)).toBe('screen')
  })
})
