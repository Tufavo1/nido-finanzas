import { describe, expect, it } from 'vitest'
import { effectivePackages, isPackageName, togglePackage } from './captureApps'

describe('lista blanca', () => {
  it('solo acepta nombres de paquete válidos', () => {
    expect(isPackageName('cl.banco.app')).toBe(true)
    expect(isPackageName('../x')).toBe(false)
    expect(isPackageName('sinpunto')).toBe(false)
  })
  it('togglePackage agrega y quita sin repetir ni mutar', () => {
    const base = ['a.b']
    expect(togglePackage(base, 'c.d')).toEqual(['a.b', 'c.d'])
    expect(togglePackage(['a.b', 'c.d'], 'a.b')).toEqual(['c.d'])
    expect(base).toEqual(['a.b'])
  })
  it('captura apagada = lista vacía hacia el teléfono, sin perder la lista guardada', () => {
    expect(effectivePackages({ enabled: false, savedPackages: ['a.b'] })).toEqual([])
    expect(effectivePackages({ enabled: true, savedPackages: ['a.b'] })).toEqual(['a.b'])
  })
})
