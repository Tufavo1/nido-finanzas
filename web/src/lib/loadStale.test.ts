import { describe, expect, it } from 'vitest'
import { isFinanceStale } from './loadStale'

const err = (code = '500') => ({ code })
describe('M2 datos desactualizados', () => {
  it('sin fallos no está desactualizado', () => {
    expect(isFinanceStale({})).toBe(false)
  })
  it('falla de sueldo/deudas pasajera: desactualizado; tabla inexistente: no (se apaga la sección)', () => {
    expect(isFinanceStale({ finance: err() })).toBe(true)
    expect(isFinanceStale({ finance: err('PGRST205') })).toBe(false)
    expect(isFinanceStale({ finance: err('42P01') })).toBe(false)
  })
  it('falla de fijos, perfiles o ingresos extra también avisa', () => {
    expect(isFinanceStale({ recurring: err() })).toBe(true)
    expect(isFinanceStale({ profiles: err() })).toBe(true)
    expect(isFinanceStale({ incomes: err() })).toBe(true)
    expect(isFinanceStale({ recurring: null, profiles: undefined })).toBe(false)
  })
})
