import { describe, expect, it } from 'vitest'
import { topCategories } from './homeSummary'

const c = (id: string, spent: number, budget = 0) => ({ id, name: id, spent, budget })

describe('topCategories: en qué se fue la plata, de un vistazo', () => {
  it('muestra solo las que tienen gasto, de mayor a menor, y a lo más 4', () => {
    const top = topCategories([c('a', 10), c('b', 500), c('c', 0), c('d', 300), c('e', 200), c('f', 100)], 610 + 500)
    expect(top.map((t) => t.id)).toEqual(['b', 'd', 'e', 'f'])
  })
  it('sin límite, la barra es la parte del total gastado', () => {
    const [t] = topCategories([c('a', 250)], 1000)
    expect(t).toMatchObject({ pct: 25, over: false, left: null })
  })
  it('con límite, la barra es cuánto del límite se usó y dice cuánto queda', () => {
    const [t] = topCategories([c('a', 250, 1000)], 5000)
    expect(t).toMatchObject({ pct: 25, over: false, left: 750 })
  })
  it('pasado el límite la barra se llena y lo marca', () => {
    const [t] = topCategories([c('a', 1500, 1000)], 5000)
    expect(t).toMatchObject({ pct: 100, over: true, left: -500 })
  })
  it('viendo a una sola persona no se comparan con el límite del hogar', () => {
    const [t] = topCategories([c('a', 250, 1000)], 500, false)
    expect(t).toMatchObject({ pct: 50, left: null })
  })
  it('sin gastos no hay nada que mostrar', () => expect(topCategories([c('a', 0, 1000)], 0)).toEqual([]))
})
