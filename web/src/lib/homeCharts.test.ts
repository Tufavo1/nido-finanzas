import { describe, expect, it } from 'vitest'
import { monthCurve, monthlyTotals, weekdayBars } from './homeCharts'

const NOW = new Date(2026, 9, 20) // 20 de octubre
const OCT = new Date(2026, 9, 1)
const r = (amount: number, spent_on: string) => ({ amount, spent_on })

describe('Gasto acumulado del mes', () => {
  const c = monthCurve([r(10_000, '2026-10-02'), r(5_000, '2026-10-02'), r(20_000, '2026-10-10')], [r(8_000, '2026-09-03'), r(40_000, '2026-09-25')], OCT, NOW)

  it('acumula día a día y corta en hoy', () => {
    expect(c.points).toHaveLength(31)
    expect(c.points[0]?.now).toBe(0)
    expect(c.points[1]?.now).toBe(15_000) // día 2
    expect(c.points[9]?.now).toBe(35_000) // día 10
    expect(c.points[19]?.now).toBe(35_000) // hoy, día 20
    expect(c.points[20]?.now).toBeNull() // día 21: todavía no pasa
    expect(c.total).toBe(35_000)
  })

  it('compara con lo que se llevaba gastado el mes pasado a esa misma fecha', () => {
    expect(c.points[19]?.prev).toBe(8_000)
    expect(c.prevSame).toBe(8_000)
    expect(c.prevTotal).toBe(48_000)
    expect(c.points[29]?.prev).toBe(48_000)
  })

  it('proyecta desde hoy con el ritmo diario', () => {
    expect(c.projected).toBe(Math.round((35_000 / 20) * 31))
    expect(c.points[18]?.proj).toBeNull() // antes de hoy no hay proyección
    expect(c.points[19]?.proj).toBe(35_000) // arranca donde está el gasto real
    expect(c.points[30]?.proj).toBe(c.projected)
  })

  it('el mes pasado se mide con sus propios días (septiembre tiene 30)', () => {
    expect(c.points[30]?.prev).toBe(48_000) // día 31 repite el cierre de septiembre
  })

  it('en un mes cerrado no hay proyección y llega hasta el último día', () => {
    const past = monthCurve([r(10_000, '2026-09-05')], [], new Date(2026, 8, 1), NOW)
    expect(past.projected).toBeNull()
    expect(past.upTo).toBe(30)
    expect(past.points.at(-1)?.now).toBe(10_000)
    expect(past.points.every((p) => p.proj === null)).toBe(true)
  })

  it('con pocos días de datos no proyecta', () => {
    expect(monthCurve([r(10_000, '2026-10-02')], [], OCT, new Date(2026, 9, 3)).projected).toBeNull()
  })

  it('sin gastos todo queda en cero', () => {
    const e = monthCurve([], [], OCT, NOW)
    expect(e.total).toBe(0)
    expect(e.projected).toBeNull()
  })
})

describe('Gasto por día de la semana', () => {
  it('suma por día y marca el más alto (el 3 de octubre de 2026 es sábado)', () => {
    const w = weekdayBars([r(10_000, '2026-10-03'), r(20_000, '2026-10-10'), r(5_000, '2026-10-05')])
    expect(w.bars[5]).toMatchObject({ name: 'sábado', amount: 30_000, count: 2 })
    expect(w.bars[0]).toMatchObject({ name: 'lunes', amount: 5_000 })
    expect(w.top).toBe(5)
  })

  it('sin gastos no hay día destacado', () => expect(weekdayBars([]).top).toBeNull())
})

describe('Últimos meses', () => {
  const h = [
    { amount: 100_000, paid_by: 'a', spent_on: '2026-08-10' },
    { amount: 300_000, paid_by: 'b', spent_on: '2026-08-12' },
    { amount: 200_000, paid_by: 'a', spent_on: '2026-09-10' },
    { amount: 50_000, paid_by: 'a', spent_on: '2026-10-03' },
  ]

  it('del hogar completo', () => {
    const m = monthlyTotals(h, 'all', OCT)
    expect(m.bars).toHaveLength(6)
    expect(m.bars.find((b) => b.key === '2026-08')?.amount).toBe(400_000)
    expect(m.bars.at(-1)).toMatchObject({ amount: 50_000, current: true })
    expect(m.avg).toBe(300_000) // (400.000 + 200.000) / 2, sin el mes en curso
  })

  it('de una sola persona', () => {
    const m = monthlyTotals(h, 'a', OCT)
    expect(m.bars.find((b) => b.key === '2026-08')?.amount).toBe(100_000)
    expect(m.avg).toBe(150_000)
  })

  it('sin meses anteriores no hay promedio', () => expect(monthlyTotals([h[3]!], 'all', OCT).avg).toBeNull())
})
