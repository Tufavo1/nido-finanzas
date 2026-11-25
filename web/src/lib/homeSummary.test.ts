import { money } from './format'
import { describe, expect, it } from 'vitest'
import { compareMonths, dayExpenses, latestExpenses, monthStatus } from './homeSummary'

const e = (id: string, spent_on: string) => ({ id, spent_on })

describe('monthStatus (H1)', () => {
  it('sin límites invita a ponerlos', () => {
    expect(monthStatus({ budget: 0, total: 50000, isCurrent: true, daysLeft: 10 })).toMatch(/límites por categoría/i)
  })
  it('mes actual con plata: cuánto queda y cuántos días', () => {
    expect(monthStatus({ budget: 100000, total: 40000, isCurrent: true, daysLeft: 12 })).toMatch(/Les quedan \$\s?60\.000 · 12 días/)
  })
  it('mes cerrado con plata: cuánto sobró', () => {
    expect(monthStatus({ budget: 100000, total: 40000, isCurrent: false, daysLeft: 0 })).toMatch(/Sobraron \$\s?60\.000/)
  })
  it('pasados del límite: cuánto se pasaron', () => {
    expect(monthStatus({ budget: 100000, total: 130000, isCurrent: true, daysLeft: 5 })).toMatch(/Se pasaron por \$\s?30\.000/)
  })
  it('justo en el límite cuenta como que les queda 0', () => {
    expect(monthStatus({ budget: 100000, total: 100000, isCurrent: true, daysLeft: 3 })).toMatch(/Les quedan \$\s?0/)
  })
})

describe('latestExpenses (H2)', () => {
  const list = [e('a', '2026-10-30'), e('b', '2026-10-29'), e('c', '2026-10-28'), e('d', '2026-10-27')]
  it('devuelve solo los 3 primeros, en el orden recibido', () => {
    expect(latestExpenses(list).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('con menos de 3 devuelve los que hay', () => {
    expect(latestExpenses(list.slice(0, 1))).toHaveLength(1)
  })
  it('sin gastos devuelve vacío', () => {
    expect(latestExpenses([])).toEqual([])
  })
  it('no modifica la lista original', () => {
    const copy = [...list]
    latestExpenses(list)
    expect(list).toEqual(copy)
  })
})

describe('dayExpenses (H3)', () => {
  const list = [e('a', '2026-10-05'), e('b', '2026-10-15'), e('c', '2026-10-05')]
  it('sin día elegido no hay lista', () => {
    expect(dayExpenses(list, null)).toEqual([])
  })
  it('filtra por día del mes', () => {
    expect(dayExpenses(list, 5).map((x) => x.id)).toEqual(['a', 'c'])
  })
  it('un día sin gastos devuelve vacío', () => {
    expect(dayExpenses(list, 6)).toEqual([])
  })
  it('el día 5 no se confunde con el 15', () => {
    expect(dayExpenses(list, 15).map((x) => x.id)).toEqual(['b'])
  })
})

describe('compareMonths: una sola regla para Inicio y Gastos', () => {
  const cur = true
  it('base cero: sin datos del mes pasado', () => {
    const c = compareMonths(467506, 0, cur)
    expect(c.kind).toBe('none')
    expect(c.text).toBe('Sin datos del mes pasado')
  })
  it('base minúscula (33.000 vs 467.506): no muestra porcentaje, muestra la diferencia en pesos', () => {
    const c = compareMonths(467506, 33000, cur)
    expect(c.kind).toBe('pesos')
    expect(c.text).toBe(`${money(434506)} más que el mes pasado a esta fecha`)
    expect(c.text).not.toMatch(/%/)
    expect(c.figure).not.toMatch(/%/)
  })
  it('base normal: porcentaje', () => {
    const c = compareMonths(150000, 100000, cur)
    expect(c.kind).toBe('pct')
    expect(c.text).toBe('50 % más que el mes pasado a esta fecha')
    expect(c.figure).toBe('+50 %')
  })
  it('base menor a 20.000 pesos aunque sea proporcional: pesos', () => {
    expect(compareMonths(30000, 15000, cur).kind).toBe('pesos')
  })
  it('base mayor que la actual (baja)', () => {
    const c = compareMonths(60000, 100000, false)
    expect(c.kind).toBe('pct')
    expect(c.text).toBe('40 % menos que el mes pasado')
    expect(c.figure).toBe('−40 %')
  })
  it('baja desde una base chica: pesos', () => {
    expect(compareMonths(1000, 15000, cur).text).toBe(`${money(14000)} menos que el mes pasado a esta fecha`)
  })
  it('igual', () => {
    expect(compareMonths(100000, 100000, cur).text).toBe('Igual que el mes pasado')
  })
  it('tope: más del triple, nunca un porcentaje sobre 300 %', () => {
    const c = compareMonths(450000, 100000, cur)
    expect(c.kind).toBe('triple')
    expect(c.text).toBe('Más del triple que el mes pasado a esta fecha')
  })
  it('mismos casos en tres alcances: Hogar, Yo y pareja usan su propia base', () => {
    const hogar = compareMonths(467506, 33000, cur)
    const yo = compareMonths(233753, 16500, cur)
    const pareja = compareMonths(233753, 120000, cur)
    expect([hogar.kind, yo.kind, pareja.kind]).toEqual(['pesos', 'pesos', 'pct'])
    expect(pareja.text).toBe('95 % más que el mes pasado a esta fecha')
  })
})
