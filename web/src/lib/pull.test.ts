import { describe, expect, it } from 'vitest'
import { PULL_THRESHOLD, pullView } from './pull'

describe('pullView', () => {
  it('sin arrastre o hacia arriba no se estira', () => {
    expect(pullView(0)).toEqual({ distance: 0, ready: false })
    expect(pullView(-30)).toEqual({ distance: 0, ready: false })
  })
  it('un arrastre corto no alcanza para actualizar', () => {
    expect(pullView(20).ready).toBe(false)
  })
  it('pasado el umbral se puede soltar para actualizar', () => {
    expect(pullView(PULL_THRESHOLD).ready).toBe(true)
  })
  it('tiene un tope', () => {
    expect(pullView(10_000).distance).toBeLessThanOrEqual(120)
  })
})
