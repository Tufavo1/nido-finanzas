// Copyright (c) 2026 Dinovance
import { describe, expect, it, vi } from 'vitest'
import { debtPaymentRow, incomeRow, saveMovement } from './movements'
import { parseNativeDraft, sanitizeAccount } from './nativeBridge'
import { duplicateMarks } from './draftFlags'
import { planDrafts } from './inbox'
import { DEFAULT_CAPTURE_CONFIG } from './captureConfig'
import type { NativeDraft } from './nativeBridge'

const mk = (o: Partial<NativeDraft> = {}): NativeDraft => ({ id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', amountClp: 34_400, merchant: null, kind: 'DEBT_PAYMENT', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: 1_700_000_000_000, createdAtMillis: 1, status: 'PENDING', ...o })
const raw = (o: Record<string, unknown> = {}) => ({ id: 'a', amountClp: 5000, merchant: null, kind: 'INCOME', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: 1, createdAtMillis: 1, status: 'PENDING', ...o })

describe('filas', () => {
  it('ingreso: monto, nombre por defecto y fecha del aviso en Chile', () => {
    // 2026-01-01 02:30 UTC = 31 dic 23:30 en Santiago (verano, UTC-3)
    const r = incomeRow('h1', mk({ kind: 'INCOME', amountClp: 90_000, postedAtMillis: Date.UTC(2026, 0, 1, 2, 30) }), Date.UTC(2026, 5, 1))
    expect(r).toMatchObject({ household_id: 'h1', amount: 90_000, source: 'Transferencia recibida', received_on: '2025-12-31' })
    expect(r.id).toBe('3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f')
  })
  it('pago de deuda: quién paga es la persona y mismo id por borrador', () => {
    const r = debtPaymentRow('h1', mk({ postedAtMillis: Date.UTC(2026, 5, 10, 15) }), 'deuda1', 'u1', Date.UTC(2026, 8, 1))
    expect(r).toMatchObject({ household_id: 'h1', debt_id: 'deuda1', amount: 34_400, paid_by: 'u1', paid_on: '2026-06-10' })
  })
})

describe('fecha de respaldo', () => {
  it('sin fecha del aviso usa hoy en Chile', () => {
    expect(incomeRow('h', mk({ kind: 'INCOME', postedAtMillis: 0 }), Date.UTC(2026, 5, 10, 15)).received_on).toBe('2026-06-10')
  })
})

describe('saveMovement', () => {
  it('ingreso guardado: inserta y luego quita el borrador', async () => {
    const order: string[] = []
    await saveMovement(mk({ kind: 'INCOME' }), 'INCOME', { insert: async () => (order.push('insert'), true), removeDraft: async () => void order.push('remove') })
    expect(order).toEqual(['insert', 'remove'])
  })
  it('si el insert falla lanza y NO borra el borrador', async () => {
    const removeDraft = vi.fn(async () => undefined)
    await expect(saveMovement(mk(), 'DEBT_PAYMENT', { insert: async () => false, removeDraft })).rejects.toThrow()
    expect(removeDraft).not.toHaveBeenCalled()
  })
  it('si falla solo el borrado local, el guardado cuenta y se avisa', async () => {
    const onRemoveError = vi.fn()
    await saveMovement(mk(), 'DEBT_PAYMENT', { insert: async () => true, removeDraft: async () => Promise.reject(new Error('x')), onRemoveError })
    expect(onRemoveError).toHaveBeenCalledOnce()
  })
  it('un tipo distinto al permitido nunca se guarda', async () => {
    const insert = vi.fn(async () => true)
    await expect(saveMovement(mk({ kind: 'EXPENSE' }), 'INCOME', { insert, removeDraft: async () => undefined })).rejects.toThrow()
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('contrato del teléfono', () => {
  it('acepta INCOME y DEBT_PAYMENT con cuenta', () => {
    expect(parseNativeDraft(raw({ account: 'Cuenta Banco Falabella ·2236' }))).toMatchObject({ kind: 'INCOME', account: 'Cuenta Banco Falabella ·2236' })
    expect(parseNativeDraft(raw({ kind: 'DEBT_PAYMENT', account: 'CMR Mastercard Premium' }))?.kind).toBe('DEBT_PAYMENT')
  })
  it('kind desconocido se descarta (no aparece ni se guarda)', () => {
    expect(parseNativeDraft(raw({ kind: 'TRANSFER' }))).toBeNull()
  })
  it('account es opcional y se sanea', () => {
    expect(parseNativeDraft(raw())?.account).toBeUndefined()
    expect(parseNativeDraft(raw({ account: 42 }))?.account).toBeUndefined()
    expect(sanitizeAccount('  Débito\n  <b>Banco</b>​  ')).toBe('Débito b Banco /b')
    expect(sanitizeAccount('x'.repeat(500))).toHaveLength(60)
    expect(sanitizeAccount('   ')).toBeNull()
  })
})

describe('no se guardan solos ni se marcan como duplicado', () => {
  it('INCOME y DEBT_PAYMENT, aunque estén confirmados o en modo automático, esperan en la bandeja', () => {
    const cfg = { ...DEFAULT_CAPTURE_CONFIG, mode: 'AUTO' as const }
    const ds = [mk({ kind: 'INCOME', status: 'CONFIRMED', merchant: 'X' }), mk({ id: 'b', kind: 'DEBT_PAYMENT', merchant: 'Y' })]
    const plan = planDrafts(ds, cfg, { categories: [{ id: 'c', name: 'X' }], history: [{ note: 'X', category_id: 'c' }] }, new Set())
    expect(plan.auto).toEqual([])
    expect(plan.ask).toHaveLength(2)
  })
  it('dos ingresos iguales no se marcan duplicado', () => {
    expect(duplicateMarks([mk({ kind: 'INCOME' }), mk({ id: 'b', kind: 'INCOME', createdAtMillis: 2 })]).size).toBe(0)
  })
})
