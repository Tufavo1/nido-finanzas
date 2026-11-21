// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { candidateToDraft, type ParsedCandidate } from './candidates'

// H-06 (f): spent_on debe ser la fecha de CHILE (America/Santiago, como el default de la base), no la del teléfono.
// Estas pruebas pasan en un equipo con zona de Chile y FALLAN con otra zona: correr  bash docs/mobile/qa/tz-check.sh
const base: ParsedCandidate = { amountClp: 1000, merchant: 'Kiosco Demo', kind: 'EXPENSE', confidence: 'HIGH', installment: null, fingerprint: 'f'.repeat(64), postedAtMillis: 0 }
const opts = { paidBy: 'u1', shared: true, categories: [], history: [] }
const day = (ms: number) => candidateToDraft({ ...base, postedAtMillis: ms }, opts).spent_on

describe('spent_on en hora de Chile', () => {
  it('compra a las 23:30 de Chile en verano (UTC-3) que ya es el día siguiente en UTC', () => {
    expect(day(Date.UTC(2026, 10, 15, 2, 30))).toBe('2026-11-14')
  })
  it('cambio de mes: 30/11 23:30 en Chile es 01/12 02:30 UTC', () => {
    expect(day(Date.UTC(2026, 11, 1, 2, 30))).toBe('2026-11-30')
  })
  it('invierno (UTC-4): 30/06 23:30 en Chile es 01/07 03:30 UTC', () => {
    expect(day(Date.UTC(2026, 6, 1, 3, 30))).toBe('2026-06-30')
  })
  it('de madrugada en Chile (00:20) sigue siendo el mismo día de Chile aunque en UTC sea de mañana', () => {
    expect(day(Date.UTC(2026, 10, 15, 3, 20))).toBe('2026-11-15')
  })
})
