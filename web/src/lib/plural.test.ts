import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectedLabel, moreCount, per100Label, pesos } from './plural'

describe('moreCount: «N cosas más» con el plural correcto', () => {
  it('1 va en singular', () => {
    expect(moreCount(1, 'deuda', 'deudas')).toBe('1 deuda más')
    expect(moreCount(1, 'categoría', 'categorías')).toBe('1 categoría más')
    expect(moreCount(1, 'gasto fijo', 'gastos fijos')).toBe('1 gasto fijo más')
  })
  it('2 o más van en plural', () => {
    expect(moreCount(2, 'deuda', 'deudas')).toBe('2 deudas más')
    expect(moreCount(12, 'meta', 'metas')).toBe('12 metas más')
    expect(moreCount(3, 'gasto', 'gastos')).toBe('3 gastos más')
  })
})

import { plural } from './plural'
import { buildPlan } from './advisor'
import { analyzeDebts } from './debtAnalysis'
import { monthStatus } from './homeSummary'

describe('plural: «1 día», «0 días», «2 días»', () => {
  it('singular solo con 1', () => {
    expect(plural(1, 'día', 'días')).toBe('1 día')
    expect(plural(0, 'día', 'días')).toBe('0 días')
    expect(plural(2, 'día', 'días')).toBe('2 días')
  })
  it('Inicio: «Les quedan $X · 1 día» al penúltimo día del mes', () => {
    expect(monthStatus({ budget: 100_000, total: 40_000, isCurrent: true, daysLeft: 1 })).toBe('Les quedan $60.000 · 1 día')
    expect(monthStatus({ budget: 100_000, total: 40_000, isCurrent: true, daysLeft: 0 })).toBe('Les quedan $60.000 · 0 días')
  })
  it('el plan dice «el día que queda» con 1 día, no «los 1 días»', () => {
    const plan = buildPlan({ now: new Date(2026, 9, 30), expenses: [], endOfMonth: -10_000, variableDaily: 30_000, income: 1_400_000, cushion: null, debtInsights: analyzeDebts([], [], new Date(2026, 9, 30), []), debts: [], debtPayments: [], categories: [] })
    const why = plan?.steps.find((s) => s.key === 'ritmo')?.why ?? ''
    expect(why).not.toContain('1 días')
    expect(why).toContain('Con 1 día por delante')
  })
})

describe('pesos y etiquetas de lectores de pantalla con conteos', () => {
  it('pesos concuerda: 1 peso, 0 y 2 pesos', () => {
    expect(pesos(1)).toBe('1 peso')
    expect(pesos(0)).toBe('0 pesos')
    expect(pesos(2)).toBe('2 pesos')
  })
  it('detectedLabel: «1 movimiento detectado», «3 movimientos detectados»', () => {
    expect(detectedLabel(1)).toBe('1 movimiento detectado')
    expect(detectedLabel(3)).toBe('3 movimientos detectados')
  })
  it('per100Label: la barra «De cada $100» lee bien el 1', () => {
    expect(per100Label({ spent: 1, debts: 0, pending: 1, saved: 2, left: 96 })).toBe('Gastos 1 peso, deudas 0 pesos, fijos por venir 1 peso, ahorro 2 pesos, te sobran 96 pesos')
  })
})

describe('ningún aria-label cuenta mal', () => {
  const files = ['../Shell.tsx', '../components/AnalysisPanel.tsx', '../components/HomeCharts.tsx']
  it.each(files)('%s no deja «N pesos» ni «N movimientos» sueltos en un aria-label', (f) => {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    for (const l of src.split('\n').filter((x) => /aria-label=/.test(x))) {
      expect(l, l).not.toMatch(/\}\s*pesos/)
      expect(l, l).not.toMatch(/\? '(gasto|peso)' : '(gastos|pesos)'/)
    }
    expect(src).not.toMatch(/<span className="sr-only"> movimientos detectados<\/span>/)
  })
})
