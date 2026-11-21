import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTURE_CONFIG } from './captureConfig'
import { expenseRow, planDrafts } from './inbox'
import type { NativeDraft } from './nativeBridge'

const draft = (o: Partial<NativeDraft> & { id: string }): NativeDraft => ({
  amountClp: 12_000, merchant: 'Almacen Demo', kind: 'EXPENSE', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: 1, createdAtMillis: 1, status: 'PENDING', ...o,
})
const ctx = { categories: [{ id: 'c1', name: 'Supermercado' }], history: [{ note: 'Almacen Demo', category_id: 'c1' }] }

describe('planDrafts', () => {
  it('por defecto (modo confirmar) todo se pregunta', () => {
    const p = planDrafts([draft({ id: 'a' }), draft({ id: 'b' })], DEFAULT_CAPTURE_CONFIG, ctx, new Set())
    expect(p.ask.map((d) => d.id)).toEqual(['a', 'b'])
    expect(p.auto).toEqual([])
  })
  it('lo que la persona ya confirmó en la notificación se guarda sin volver a preguntar', () => {
    const p = planDrafts([draft({ id: 'a', status: 'CONFIRMED' })], DEFAULT_CAPTURE_CONFIG, ctx, new Set())
    expect(p.auto.map((d) => d.id)).toEqual(['a'])
  })
  it('un gasto confirmado en la notificación pero sin categoría conocida espera en la bandeja', () => {
    const p = planDrafts([draft({ id: 'x', status: 'CONFIRMED', merchant: 'Lugar Nuevo' })], DEFAULT_CAPTURE_CONFIG, ctx, new Set())
    expect(p.ask.map((d) => d.id)).toEqual(['x'])
  })
  it('modo automático: solo dentro del tope, de confianza alta y con categoría aprendida', () => {
    const cfg = { ...DEFAULT_CAPTURE_CONFIG, mode: 'AUTO' as const, maxClp: 50_000 }
    const p = planDrafts([draft({ id: 'ok' }), draft({ id: 'caro', amountClp: 50_001 }), draft({ id: 'dudoso', confidence: 'MEDIUM' }), draft({ id: 'nuevo', merchant: 'Otro Lugar' })], cfg, ctx, new Set())
    expect(p.auto.map((d) => d.id)).toEqual(['ok'])
    expect(p.ask.map((d) => d.id)).toEqual(['caro', 'dudoso', 'nuevo'])
  })
  it('los abonos nunca se guardan solos', () => {
    const cfg = { ...DEFAULT_CAPTURE_CONFIG, mode: 'AUTO' as const }
    expect(planDrafts([draft({ id: 'i', kind: 'INCOME' })], cfg, ctx, new Set()).auto).toEqual([])
  })
  it('los que ya se están procesando se ignoran (no se guarda dos veces)', () => {
    const p = planDrafts([draft({ id: 'a', status: 'CONFIRMED' }), draft({ id: 'b' })], DEFAULT_CAPTURE_CONFIG, ctx, new Set(['a', 'b']))
    expect(p).toEqual({ auto: [], ask: [] })
  })
})

describe('expenseRow', () => {
  const form = { amount: 12_000, note: ' Almacen Demo ', spent_on: '2026-11-21', shared: true, paid_by: 'u2', category_id: 'c1' }
  it('arma la fila con el id idempotente y recorta la nota', () => {
    expect(expenseRow('h1', 'id-1', form, 'u1')).toEqual({ id: 'id-1', household_id: 'h1', category_id: 'c1', amount: 12_000, paid_by: 'u2', shared: true, note: 'Almacen Demo', spent_on: '2026-11-21' })
  })
  it('un gasto personal lo paga siempre quien lo anota', () => {
    expect(expenseRow('h1', 'id-1', { ...form, shared: false }, 'u1').paid_by).toBe('u1')
  })
  it('sin categoría no se puede guardar', () => {
    expect(() => expenseRow('h1', 'id-1', { ...form, category_id: null }, 'u1')).toThrow(/categor/i)
  })
})
