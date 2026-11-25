// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import type { Debt } from './data'
import { summarizeDebts } from './finance'

const d = (id: string, rate: number): Debt => ({ id, household_id: 'h', name: id, kind: 'consumo', owner_id: null, original_amount: 500_000, monthly_payment: 50_000, monthly_rate: rate, due_day: 5, archived: false, created_at: '2026-01-01T00:00:00Z' })

describe('tasas con coma decimal', () => {
  it('«Paguen primero» muestra 2,5 % mensual, no 2.5', () => {
    const s = summarizeDebts([d('a', 2.5), d('b', 1)], [], new Date(2026, 10, 5), [], [])
    const f = s.findings.find((x) => x.title.startsWith('Paguen primero'))
    expect(f?.detail).toContain('2,5 % mensual')
  })
})
