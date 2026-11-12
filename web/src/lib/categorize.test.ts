import { describe, expect, it } from 'vitest'
import { suggestCategory, suggestShared } from './categorize'
import { draftFromNotice } from './register'

const cats = [
  { id: 'super', name: 'Supermercado' },
  { id: 'hogar', name: 'Hogar y cuentas' },
  { id: 'transp', name: 'Transporte' },
  { id: 'salud', name: 'Salud' },
  { id: 'ocio', name: 'Ocio' },
  { id: 'otros', name: 'Otros' },
]
const past = (note: string, category_id: string) => ({ note, category_id })

describe('suggestCategory: adivinar la categoría de un gasto', () => {
  it('primero aprende de lo que la persona ya anotó con ese mismo nombre', () => {
    // Para esta persona «Copec» es la tienda de la esquina, no bencina
    expect(suggestCategory('Copec Las Condes', cats, [past('copec las condes', 'super')])).toBe('super')
  })

  it('si lo anotó en varias categorías gana la más repetida', () => {
    const h = [past('Lider', 'hogar'), past('Lider', 'super'), past('LIDER', 'super')]
    expect(suggestCategory('Lider', cats, h)).toBe('super')
  })

  it('reconoce el mismo comercio aunque cambie la sucursal', () => {
    expect(suggestCategory('Starbucks Costanera', cats, [past('Starbucks Providencia', 'otros')])).toBe('otros')
  })

  it('sin historial usa comercios conocidos', () => {
    expect(suggestCategory('Lider Express', cats, [])).toBe('super')
    expect(suggestCategory('COPEC LAS CONDES', cats, [])).toBe('transp')
    expect(suggestCategory('Farmacia Cruz Verde', cats, [])).toBe('salud')
    expect(suggestCategory('Netflix', cats, [])).toBe('ocio')
    expect(suggestCategory('Enel Distribución', cats, [])).toBe('hogar')
  })

  it('no se confunde con tildes ni mayúsculas', () => {
    expect(suggestCategory('CLÍNICA ALEMANA', cats, [])).toBe('salud')
  })

  it('si no sabe, no inventa', () => {
    expect(suggestCategory('Juan Pérez', cats, [])).toBeNull()
    expect(suggestCategory('', cats, [past('', 'super')])).toBeNull()
  })

  it('no sugiere una categoría que el hogar ya no tiene', () => {
    expect(suggestCategory('Netflix', [{ id: 'x', name: 'Mascotas' }], [])).toBeNull()
    expect(suggestCategory('Lider', cats, [past('Lider', 'borrada')])).toBe('super')
  })
})

describe('draftFromNotice: del aviso del banco al gasto listo para guardar', () => {
  const NOW = new Date(2026, 10, 11)

  it('llena monto, nota, fecha y categoría', () => {
    const d = draftFromNotice('Compra por $12.990 en LIDER EXPRESS el 10/11/2026', cats, [], NOW)
    expect(d).toEqual({ ok: true, digits: '12990', note: 'Lider Express', date: '2026-11-10', catId: 'super' })
  })

  it('sin categoría reconocida deja que la persona la elija', () => {
    const d = draftFromNotice('Transferencia realizada a Juan Pérez por $20.000', cats, [], NOW)
    expect(d).toEqual({ ok: true, digits: '20000', note: 'Juan Pérez', date: '', catId: null })
  })

  it('explica cuando el aviso es de plata que entró', () => {
    expect(draftFromNotice('Recibiste una transferencia de María por $50.000', cats, [], NOW)).toEqual({
      ok: false,
      error: 'Ese aviso es de plata que entró, no de un gasto.',
    })
  })

  it('explica cuando no encuentra un monto', () => {
    expect(draftFromNotice('Hola', cats, [], NOW)).toEqual({ ok: false, error: 'No encontramos un monto en pesos en ese aviso. Anótalo a mano.' })
  })

  it('un monto más grande de lo que acepta la app se rechaza', () => {
    expect(draftFromNotice('Compra por $9.999.999.999 en X', cats, [], NOW).ok).toBe(false)
  })
})

describe('suggestShared: ¿compartido o personal?', () => {
  const h = (category_id: string, shared: boolean) => ({ note: 'x', category_id, shared })
  it('repite lo que la persona suele elegir en esa categoría', () => {
    expect(suggestShared('ocio', [h('ocio', false), h('ocio', false), h('ocio', true)])).toBe(false)
    expect(suggestShared('super', [h('super', true), h('ocio', false)])).toBe(true)
  })
  it('en empate manda el gasto más reciente (la lista viene de más nuevo a más viejo)', () => {
    expect(suggestShared('ocio', [h('ocio', false), h('ocio', true)])).toBe(false)
  })
  it('sin gastos en esa categoría no opina', () => {
    expect(suggestShared('salud', [h('ocio', false)])).toBeNull()
    expect(suggestShared('', [])).toBeNull()
  })
})
