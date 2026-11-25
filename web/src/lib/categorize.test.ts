import { describe, expect, it } from 'vitest'
import { suggestCategory, suggestShared } from './categorize'

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
    expect(suggestCategory('Starbucks Costanera', cats, [past('Starbucks Providencia', 'super')])).toBe('super')
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

describe('suggestCategory: comercio con prefijo y categoría general', () => {
  it('reconoce la palabra clave dentro del nombre aunque tenga prefijo, guion o mayúsculas', () => {
    expect(suggestCategory('PRUEBA-EMU FARMACIA', cats, [])).toBe('salud')
    expect(suggestCategory('Prueba-Emu Farmacia', cats, [])).toBe('salud')
    expect(suggestCategory('Farmacias Ahumada', cats, [])).toBe('salud')
    expect(suggestCategory('Cruz Verde', cats, [])).toBe('salud')
    expect(suggestCategory('Unimarc', cats, [])).toBe('super')
    expect(suggestCategory('JUMBO', cats, [])).toBe('super')
    expect(suggestCategory('Comercio Desconocido', cats, [])).toBeNull()
  })
  it('un gasto que quedó en la general («Otros») no tapa la palabra clave', () => {
    const h = [past('PRUEBA-EMU FARMACIA', 'otros')]
    expect(suggestCategory('PRUEBA-EMU FARMACIA', cats, h)).toBe('salud')
    expect(suggestCategory('Prueba-Emu Farmacia', cats, h)).toBe('salud')
  })
  it('si no hay palabra clave, lo aprendido en la general se respeta', () => {
    expect(suggestCategory('Juan Pérez', cats, [past('Juan Pérez', 'otros')])).toBe('otros')
  })
  it('una categoría elegida a mano que no es la general sigue ganando', () => {
    expect(suggestCategory('Prueba-Emu Farmacia', cats, [past('Prueba-Emu Farmacia', 'super')])).toBe('super')
  })
  it('busca la categoría por su nombre real, no por un id fijo', () => {
    const mine = [{ id: 'k9', name: 'Salud y bienestar' }, { id: 'zz', name: 'Varios' }]
    expect(suggestCategory('Prueba-Emu Farmacia', mine, [past('Prueba-Emu Farmacia', 'zz')])).toBe('k9')
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
