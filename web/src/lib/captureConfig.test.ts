import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTURE_CONFIG, MAX_CAP_CLP, MIN_CAP_CLP, parseCaptureConfig, serializeCaptureConfig } from './captureConfig'

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
  it('el tope es editable: cualquier monto entero dentro del rango permitido', () => {
    expect(parseCaptureConfig(JSON.stringify({ maxClp: 77_000 })).maxClp).toBe(77_000)
    expect(parseCaptureConfig(JSON.stringify({ maxClp: MIN_CAP_CLP })).maxClp).toBe(MIN_CAP_CLP)
    expect(parseCaptureConfig(JSON.stringify({ maxClp: MAX_CAP_CLP })).maxClp).toBe(MAX_CAP_CLP)
  })
  it('un tope fuera del rango o con decimales vuelve al valor por defecto', () => {
    for (const v of [123, MAX_CAP_CLP + 1, 50_000.5, '9000']) expect(parseCaptureConfig(JSON.stringify({ maxClp: v })).maxClp).toBe(50_000)
  })
})
