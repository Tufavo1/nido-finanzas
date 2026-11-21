import { describe, expect, it } from 'vitest'
import { statusBarFor } from './nativeChrome'

describe('statusBarFor (CA-14-3)', () => {
  it('en oscuro el color coincide con el fondo oscuro y el texto es claro', () => {
    expect(statusBarFor(true)).toEqual({ style: 'DARK', color: '#1d1828' })
  })
  it('en claro coincide con el fondo de la marca', () => {
    expect(statusBarFor(false)).toEqual({ style: 'LIGHT', color: '#fde2e4' })
  })
})
