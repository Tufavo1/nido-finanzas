import { describe, expect, it } from 'vitest'
import { fillForecast } from './storage'

const MB = 1024 * 1024

describe('fillForecast', () => {
  it('sin crecimiento hay espacio de sobra', () => {
    expect(fillForecast(40 * MB, 500 * MB, 0).days).toBeNull()
  })
  it('proyecta en años cuando crece despacio', () => {
    const f = fillForecast(40 * MB, 500 * MB, 100_000)
    expect(f.text).toContain('años')
  })
  it('avisa cuando queda poco', () => {
    const f = fillForecast(490 * MB, 500 * MB, 1 * MB)
    expect(f.days).toBe(10)
    expect(f.text).toContain('Ojo')
  })
  it('con la base llena lo dice', () => {
    expect(fillForecast(500 * MB, 500 * MB, 10).days).toBe(0)
  })
})
