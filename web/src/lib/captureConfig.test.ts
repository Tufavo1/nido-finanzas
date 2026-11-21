import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTURE_CONFIG, LIMIT_CHOICES, parseCaptureConfig, serializeCaptureConfig } from './captureConfig'

describe('captureConfig', () => {
  it('por defecto el modo automático está apagado, con tope de 50.000 y sin apps guardadas', () => {
    expect(DEFAULT_CAPTURE_CONFIG).toEqual({ mode: 'CONFIRM', maxClp: 50_000, shared: true, savedPackages: [], enabled: true })
  })
  it('lo que no existe o no se entiende vuelve a los valores por defecto', () => {
    expect(parseCaptureConfig(null)).toEqual(DEFAULT_CAPTURE_CONFIG)
    expect(parseCaptureConfig('no es json')).toEqual(DEFAULT_CAPTURE_CONFIG)
    expect(parseCaptureConfig('[1,2]')).toEqual(DEFAULT_CAPTURE_CONFIG)
  })
  it('guarda y lee de vuelta lo mismo', () => {
    const c = { mode: 'AUTO' as const, maxClp: 100_000, shared: false, savedPackages: ['cl.banco.app'], enabled: false }
    expect(parseCaptureConfig(serializeCaptureConfig(c))).toEqual(c)
  })
  it('descarta valores peligrosos: modo raro, tope fuera de lo permitido, paquetes inválidos', () => {
    const c = parseCaptureConfig(JSON.stringify({ mode: 'X', maxClp: -5, shared: 'si', savedPackages: ['ok.app', '../mal', 3], enabled: 1 }))
    expect(c.mode).toBe('CONFIRM')
    expect(c.maxClp).toBe(50_000)
    expect(c.shared).toBe(true)
    expect(c.savedPackages).toEqual(['ok.app'])
    expect(c.enabled).toBe(true)
  })
  it('el tope debe ser uno de los ofrecidos', () => {
    expect(LIMIT_CHOICES).toContain(50_000)
    expect(parseCaptureConfig(JSON.stringify({ maxClp: 123 })).maxClp).toBe(50_000)
    expect(parseCaptureConfig(JSON.stringify({ maxClp: 200_000 })).maxClp).toBe(200_000)
  })
})
