import { describe, expect, it } from 'vitest'
import { buildAutoProfile, syncApiBase } from './autoSync'

describe('syncApiBase', () => {
  it('solo https; vacío, http o basura → null (no se envía nada en segundo plano)', () => {
    expect(syncApiBase('https://worker.ejemplo.cl/supabase/')).toBe('https://worker.ejemplo.cl/supabase')
    expect(syncApiBase('')).toBeNull()
    expect(syncApiBase(undefined)).toBeNull()
    expect(syncApiBase('http://worker.ejemplo.cl')).toBeNull()
    expect(syncApiBase('no es url')).toBeNull()
  })
})

describe('buildAutoProfile', () => {
  const categories = [{ id: 'c1', name: 'Supermercado' }, { id: 'c2', name: 'Salidas' }]
  const history = [
    { note: 'Almacen Demo', category_id: 'c1' },
    { note: 'Fuente borrada', category_id: 'c-borrada' },
  ]
  it('arma dueño, hogar, quién paga, compartido y las categorías aprendidas', () => {
    const p = buildAutoProfile({ userId: 'u1', householdId: 'h1', shared: false, categories, history })
    expect(p).toMatchObject({ ownerKey: 'u1:h1', userId: 'u1', householdId: 'h1', paidBy: 'u1', shared: false })
    expect(p.categories).toEqual(expect.arrayContaining([{ key: 'almacen demo', categoryId: 'c1' }]))
  })
  it('ignora categorías que ya no existen', () => {
    const p = buildAutoProfile({ userId: 'u1', householdId: 'h1', shared: true, categories, history })
    expect(p.categories.some((c) => c.categoryId === 'c-borrada')).toBe(false)
  })
})
