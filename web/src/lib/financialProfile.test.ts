import { describe, expect, it } from 'vitest'
import type { Analysis } from './analysis'
import type { Numbers } from './numbers'
import { buildFinancialProfile, levelFor } from './financialProfile'

const parts = (ahorro: number, deudas: number, presupuesto: number, colchon: number) =>
  [
    { key: 'ahorro', label: 'Ahorro', points: (ahorro * 40) / 100, max: 40, level: ahorro >= 70 ? 'ok' : 'warn', detail: 'ahorro' },
    { key: 'deudas', label: 'Deudas', points: (deudas * 25) / 100, max: 25, level: deudas >= 70 ? 'ok' : 'warn', detail: 'deudas' },
    { key: 'presupuesto', label: 'Presupuesto', points: (presupuesto * 15) / 100, max: 15, level: presupuesto >= 70 ? 'ok' : 'warn', detail: 'presupuesto' },
    { key: 'colchon', label: 'Imprevistos', points: (colchon * 20) / 100, max: 20, level: colchon >= 70 ? 'ok' : 'warn', detail: 'colchón' },
  ] as const

function mk(opts: { score: number; savingsPct: number; debts: number; over?: boolean; wants?: number; p?: [number, number, number, number] }) {
  const [a1, a2, a3, a4] = opts.p ?? [50, 50, 50, 50]
  const a = {
    hasData: true,
    cost: 500000,
    income: 1000000,
    cushionMonths: 1,
    score: { value: opts.score, label: '', level: 'ok', parts: parts(a1, a2, a3, a4) },
    rule: { needs: 0, wants: ((opts.wants ?? 20) * 1000000) / 100, savings: 0, income: 1000000 },
  } as unknown as Analysis
  const n = {
    flow: { income: 1000000, savingsPct: opts.savingsPct, outlook: opts.over ? -1 : 100, over: !!opts.over, per100: { debts: opts.debts } },
  } as unknown as Numbers
  return { a, n }
}

const key = (o: Parameters<typeof mk>[0]) => {
  const { a, n } = mk(o)
  const r = buildFinancialProfile(a, n)
  return r.ready ? r.profile.key : 'no-listo'
}

describe('perfil financiero', () => {
  it('pide datos cuando falta el sueldo o los gastos', () => {
    const r = buildFinancialProfile(null, null)
    expect(r.ready).toBe(false)
  })
  it('clasifica según ahorro, deudas y gastos', () => {
    expect(key({ score: 20, savingsPct: -5, debts: 30, over: true })).toBe('rescate')
    expect(key({ score: 40, savingsPct: 5, debts: 55 })).toBe('deudas')
    expect(key({ score: 85, savingsPct: 25, debts: 5 })).toBe('solido')
    expect(key({ score: 70, savingsPct: 25, debts: 10 })).toBe('ahorrador')
    expect(key({ score: 50, savingsPct: 5, debts: 10, wants: 50 })).toBe('gustos')
    expect(key({ score: 60, savingsPct: 12, debts: 10 })).toBe('equilibrado')
    expect(key({ score: 40, savingsPct: 3, debts: 10 })).toBe('justo')
  })
  it('calcula el nivel y lo que falta para el siguiente', () => {
    expect(levelFor(10)).toEqual({ level: 1, name: 'Punto de partida', toNext: 20 })
    expect(levelFor(65).level).toBe(4)
    expect(levelFor(95)).toEqual({ level: 5, name: 'Libertad en camino', toNext: null })
  })
  it('da tres pasos aunque todo vaya bien', () => {
    const { a, n } = mk({ score: 90, savingsPct: 30, debts: 5, p: [95, 95, 95, 95] })
    const r = buildFinancialProfile(a, n)
    expect(r.ready && r.profile.steps).toHaveLength(3)
  })
  it('da siempre tres pasos, empezando por lo más débil', () => {
    const { a, n } = mk({ score: 40, savingsPct: 3, debts: 10, p: [20, 90, 60, 40] })
    const r = buildFinancialProfile(a, n)
    expect(r.ready && r.profile.steps).toHaveLength(3)
    expect(r.ready && r.profile.steps[0].title).toMatch(/ahorro/i)
  })
})
