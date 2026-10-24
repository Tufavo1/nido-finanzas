import { describe, expect, it } from 'vitest'
import type { Expense } from './data'
import { groupByDay, whereItWent } from './moves'
import { dayHeading, inDays, nextOccurrence } from './ui'

const e = (spent_on: string, amount: number, note: string | null): Expense => ({ spent_on, amount, note }) as Expense

describe('movimientos', () => {
  it('agrupa por día, el más reciente primero, con su total', () => {
    const g = groupByDay([e('2026-10-02', 1000, 'a'), e('2026-10-05', 500, 'b'), e('2026-10-05', 700, 'c')])
    expect(g.map((x) => x.date)).toEqual(['2026-10-05', '2026-10-02'])
    expect(g[0]?.total).toBe(1200)
  })

  it('junta las notas iguales sin importar mayúsculas', () => {
    const w = whereItWent([e('2026-10-02', 1000, 'Feria'), e('2026-10-03', 2000, 'feria'), e('2026-10-04', 500, null)])
    expect(w[0]).toMatchObject({ total: 3000, count: 2 })
    expect(w[1]?.label).toBe('Sin detalle')
  })
})

describe('fechas', () => {
  const now = new Date(2026, 9, 22)
  it('próxima ocurrencia de un día del mes', () => {
    expect(nextOccurrence(25, now).getDate()).toBe(25)
    expect(nextOccurrence(5, now).getMonth()).toBe(10)
    expect(nextOccurrence(22, now).getMonth()).toBe(9)
    expect(nextOccurrence(31, new Date(2026, 10, 15)).getDate()).toBe(30)
  })
  it('encabezados de día', () => {
    expect(dayHeading('2026-10-22', now)).toBe('Hoy')
    expect(dayHeading('2026-10-21', now)).toBe('Ayer')
    expect(dayHeading('2026-10-19', now)).toBe('Lunes 19 de octubre')
    expect(inDays(1)).toBe('mañana')
  })
})
