import { describe, expect, it } from 'vitest'
import { otherCategories, topCategories } from './homeSummary'

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

describe('otherCategories: lo que no cabe en las 4 de arriba (para que la suma cuadre con el total)', () => {
  it('suma las categorías que quedaron fuera y cuántas son', () => {
    const rows = [c('a', 10), c('b', 500), c('c', 0), c('d', 300), c('e', 200), c('f', 100)]
    expect(otherCategories(rows, topCategories(rows, 1110))).toEqual({ spent: 10, count: 1 })
  })
  it('con todo a la vista no hay nada más', () => {
    const rows = [c('a', 10), c('b', 500)]
    expect(otherCategories(rows, topCategories(rows, 510))).toBeNull()
  })
  it('lo de arriba más «otras» es el total', () => {
    const rows = [c('a', 10), c('b', 500), c('d', 300), c('e', 200), c('f', 100), c('g', 7)]
    const top = topCategories(rows, 1117)
    expect(top.reduce((s, t) => s + t.spent, 0) + (otherCategories(rows, top)?.spent ?? 0)).toBe(1117)
  })
})
