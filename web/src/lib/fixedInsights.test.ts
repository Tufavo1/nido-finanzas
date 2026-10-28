import { describe, expect, it } from 'vitest'
import { analyzeFixed } from './fixedInsights'

const it1 = (note: string, amount: number, category = 'Hogar', left = 20) => ({ note, amount, category, left })

describe('analyzeFixed', () => {
  it('sin fijos no dice nada', () => expect(analyzeFixed([], 1_000_000)).toEqual([]))
  it('avisa cuando los fijos pasan de la mitad del sueldo', () => {
    const f = analyzeFixed([it1('Arriendo', 600_000)], 1_000_000)
    expect(f[0].level).toBe('bad')
    expect(f[0].title).toContain('60 %')
  })
  it('sin sueldo pide anotarlo', () => expect(analyzeFixed([it1('Luz', 30_000)], 0)[0].title).toContain('sueldo'))
  it('marca el gasto que domina y lo que vence esta semana', () => {
    const f = analyzeFixed([it1('Arriendo', 400_000, 'Hogar', 3), it1('Netflix', 9_000, 'Ocio')], 2_000_000)
    expect(f.some((x) => x.title.includes('Arriendo') && x.title.includes('98 %'))).toBe(true)
    expect(f.some((x) => x.title.startsWith('Esta semana'))).toBe(true)
  })
})

describe('analyzeFixed sin comparar con sueldo', () => {
  it('con null no habla del sueldo', () => {
    const f = analyzeFixed([it1('Arriendo', 400_000), it1('Luz', 30_000, 'Cuentas')], null)
    expect(f.some((x) => x.title.includes('sueldo'))).toBe(false)
    expect(f.length).toBeGreaterThan(0)
  })
})
