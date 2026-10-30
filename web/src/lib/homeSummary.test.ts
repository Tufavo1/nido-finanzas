import { describe, expect, it } from 'vitest'
import { dayExpenses, deltaText, latestExpenses, monthStatus } from './homeSummary'

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

describe('deltaText (H4)', () => {
  it('sin mes pasado para comparar no dice nada', () => {
    expect(deltaText(null, true)).toBeNull()
  })
  it('igual', () => {
    expect(deltaText(0, true)).toBe('Igual que el mes pasado')
  })
  it('más, en el mes actual aclara «a esta fecha»', () => {
    expect(deltaText(12, true)).toBe('12 % más que el mes pasado a esta fecha')
  })
  it('menos, en un mes cerrado no aclara la fecha', () => {
    expect(deltaText(-8, false)).toBe('8 % menos que el mes pasado')
  })
})
