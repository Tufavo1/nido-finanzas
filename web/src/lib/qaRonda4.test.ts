// Copyright (c) 2026 Dinovance
/// <reference types="node" />
// QA ronda 4: bandeja de ingresos y pagos de deuda (DetectedInbox, movements, debtMatch). Datos SINTETICOS. ROJO = defecto actual.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { debtPaymentRow, incomeRow, saveMovement } from './movements'
import { matchDebt } from './debtMatch'
import { parseNativeDraft, sanitizeAccount } from './nativeBridge'
import type { NativeDraft } from './nativeBridge'
import { planDrafts } from './inbox'
import { decideCapture } from './candidates'
import { DEFAULT_CAPTURE_CONFIG } from './captureConfig'

const ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const mk = (o: Partial<NativeDraft> = {}): NativeDraft => ({ id: ID, amountClp: 34_400, merchant: null, kind: 'DEBT_PAYMENT', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: 1_700_000_000_000, createdAtMillis: 1, status: 'PENDING', ...o })
const raw = (o: Record<string, unknown> = {}) => ({ id: 'a', amountClp: 5000, merchant: null, kind: 'INCOME', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: 1, createdAtMillis: 1, status: 'PENDING', ...o })
const cats = [{ id: 'c1', name: 'Comida' }]
const hist = [{ note: 'Ganaderia Rio Bueno S.a', category_id: 'c1' }]
const cfgAuto = { ...DEFAULT_CAPTURE_CONFIG, mode: 'AUTO' as const }

describe('r4 nunca se guardan solos (modo automatico global)', () => {
  it('INCOME y DEBT_PAYMENT, aunque traigan comercio conocido y esten CONFIRMED o PENDING, van a preguntar', () => {
    const ds = [
      mk({ kind: 'INCOME', merchant: 'Ganaderia Rio Bueno S.a', status: 'PENDING' }), mk({ id: 'b', kind: 'INCOME', merchant: 'Ganaderia Rio Bueno S.a', status: 'CONFIRMED' }),
      mk({ id: 'c', kind: 'DEBT_PAYMENT', merchant: 'Ganaderia Rio Bueno S.a', status: 'PENDING' }), mk({ id: 'd', kind: 'DEBT_PAYMENT', merchant: 'Ganaderia Rio Bueno S.a', status: 'CONFIRMED' }),
    ]
    const plan = planDrafts(ds, cfgAuto, { categories: cats, history: hist }, new Set())
    expect(plan.auto).toEqual([]); expect(plan.ask).toHaveLength(4)
    for (const d of ds) expect(decideCapture(d, { mode: 'AUTO', maxClp: 1e9 }, { categories: cats, history: hist })).toBe('ASK')
  })
  it('el gasto oficial conocido SI se guarda solo en modo automatico (control)', () => {
    const plan = planDrafts([mk({ kind: 'EXPENSE', amountClp: 6_778, merchant: 'Ganaderia Rio Bueno S.a' })], cfgAuto, { categories: cats, history: hist }, new Set())
    expect(plan.auto).toHaveLength(1)
  })
})

describe('r4 frontera con el telefono (parseNativeDraft / sanitizeAccount)', () => {
  it('acepta DEBT_PAYMENT y rechaza tipos desconocidos, montos 0, negativos o enormes', () => {
    expect(parseNativeDraft(raw({ kind: 'DEBT_PAYMENT', account: 'CMR Mastercard Premium' }))?.kind).toBe('DEBT_PAYMENT')
    for (const bad of [{ kind: 'TRANSFER' }, { kind: 'income' }, { amountClp: 0 }, { amountClp: -5 }, { amountClp: 1e10 }, { amountClp: 12.5 }, { amountClp: Number.MAX_SAFE_INTEGER + 2 }]) expect(parseNativeDraft(raw(bad))).toBeNull()
  })
  it('la cuenta hostil se sanea: control, bidi, ancho cero y etiquetas', () => {
    const s = sanitizeAccount('‮<img onerror=x>Cuenta\u0000 Falabella​ ·2236')!
    expect(s).not.toMatch(/[<>\u0000-\u001f​-‏‪-‮]/)
    expect(sanitizeAccount('   ')).toBeNull(); expect(sanitizeAccount(42)).toBeNull(); expect(sanitizeAccount('x'.repeat(500))!.length).toBeLessThanOrEqual(60)
  })
  it('ROJO los aislantes bidi U+2066..2069 y el BOM tambien se quitan de la cuenta', () => {
    const s = sanitizeAccount('Cuenta ⁦Falabella⁩﻿ ·2236')!
    expect(s).not.toMatch(/[⁦-⁩﻿]/)
  })
})

describe('r4 guardar ingreso o pago: el borrador solo se quita si se guardo', () => {
  it('insert que devuelve false: lanza y NO quita el borrador (ingreso y pago)', async () => {
    for (const [kind, ] of [['INCOME'], ['DEBT_PAYMENT']] as const) {
      const removeDraft = vi.fn(async () => undefined)
      await expect(saveMovement(mk({ kind }), kind, { insert: async () => false, removeDraft })).rejects.toThrow()
      expect(removeDraft).not.toHaveBeenCalled()
    }
  })
  it('insert que RECHAZA (excepcion de red): propaga y NO quita el borrador', async () => {
    const removeDraft = vi.fn(async () => undefined)
    await expect(saveMovement(mk(), 'DEBT_PAYMENT', { insert: () => Promise.reject(new Error('Failed to fetch')), removeDraft })).rejects.toThrow()
    expect(removeDraft).not.toHaveBeenCalled()
  })
  it('si quitar el borrador falla, el guardado vale y solo se avisa', async () => {
    const onRemoveError = vi.fn()
    await saveMovement(mk(), 'DEBT_PAYMENT', { insert: async () => true, removeDraft: async () => { throw new Error('x') }, onRemoveError })
    expect(onRemoveError).toHaveBeenCalledTimes(1)
  })
  it('un pago no se guarda como ingreso ni al reves (tipo enganoso) y no toca nada', async () => {
    const insert = vi.fn(async () => true); const removeDraft = vi.fn(async () => undefined)
    await expect(saveMovement(mk({ kind: 'DEBT_PAYMENT' }), 'INCOME', { insert, removeDraft })).rejects.toThrow()
    await expect(saveMovement(mk({ kind: 'INCOME' }), 'DEBT_PAYMENT', { insert, removeDraft })).rejects.toThrow()
    await expect(saveMovement(mk({ kind: 'EXPENSE' }), 'INCOME', { insert, removeDraft })).rejects.toThrow()
    expect(insert).not.toHaveBeenCalled(); expect(removeDraft).not.toHaveBeenCalled()
  })
  it('doble toque: el mismo borrador da el mismo id (el segundo envio es 23505 = guardado)', () => {
    expect(incomeRow('h', mk({ kind: 'INCOME' })).id).toBe(incomeRow('h', mk({ kind: 'INCOME' })).id)
    expect(debtPaymentRow('h', mk(), 'd1', 'me').id).toBe(debtPaymentRow('h', mk(), 'd1', 'me').id)
  })
  it('el monto es entero y la fila no lleva comercio, cuenta ni texto del aviso', () => {
    const r = incomeRow('h', mk({ kind: 'INCOME', amountClp: 10_000, merchant: 'Secreto', account: 'Cuenta Falabella ·2236' }))
    expect(JSON.stringify(r)).not.toMatch(/Secreto|Falabella|2236/)
    const p = debtPaymentRow('h', mk({ merchant: 'Secreto' }), 'd1', 'me')
    expect(JSON.stringify(p)).not.toMatch(/Secreto/); expect(Number.isInteger(p.amount)).toBe(true)
  })
  it('ROJO el ingreso y el pago llevan la fecha DEL AVISO, no la del dia en que se toca Guardar', () => {
    // aviso 31-dic 23:50 en Santiago, guardado al dia siguiente: la fecha debe ser 31-dic (cambia de mes y de balance)
    const posted = Date.UTC(2026, 0, 1, 2, 50) // 31 dic 23:50 CLST
    const next = Date.UTC(2026, 0, 1, 15, 0)
    expect(incomeRow('h', mk({ kind: 'INCOME', postedAtMillis: posted }), next).received_on).toBe('2025-12-31')
    expect(debtPaymentRow('h', mk({ postedAtMillis: posted }), 'd', 'me', next).paid_on).toBe('2025-12-31')
  })
})

describe('r4 emparejar la deuda (pago de un toque)', () => {
  const debts = (...names: string[]) => names.map((name, i) => ({ id: 'd' + i, name }))
  it('cuenta ausente o deudas archivadas: elegir o ninguna, nunca un toque', () => {
    expect(matchDebt(null, debts('CMR Mastercard')).kind).not.toBe('one')
    expect(matchDebt('CMR Mastercard Premium ·5766', [{ id: 'x', name: 'CMR', archived: true }]).kind).toBe('none')
  })
  it('dos deudas igual de parecidas: elige la persona', () => {
    expect(matchDebt('CMR Mastercard Premium ·5766', debts('CMR Visa', 'CMR Oro')).kind).not.toBe('one')
  })
  it('los ultimos 4 digitos desempatan', () => {
    const m = matchDebt('CMR Mastercard Premium ·5766', debts('CMR 1111', 'CMR 5766'))
    expect(m.kind === 'one' && m.debt.name).toBe('CMR 5766')
  })
  it('ROJO si los ultimos 4 digitos CONTRADICEN a la deuda, no se ofrece pagarla de un toque', () => {
    const m = matchDebt('CMR Mastercard Premium ·5766', debts('CMR Mastercard 9999'))
    expect(m.kind, 'una tarjeta terminada en 9999 no es la 5766').not.toBe('one')
  })
  it('ROJO una sola palabra generica (mastercard) de OTRO banco no basta para el pago de un toque', () => {
    const m = matchDebt('CMR Mastercard Premium ·5766', debts('Mastercard Santander'))
    expect(m.kind, 'se abonaria a la deuda del banco equivocado').not.toBe('one')
  })
  it('cuenta con HTML o texto gigante no rompe ni devuelve mas de 6 opciones', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: 'd' + i, name: 'CMR ' + i }))
    const m = matchDebt('<script>CMR</script>'.repeat(100), many)
    if (m.kind === 'choose') expect(m.debts.length).toBeLessThanOrEqual(6)
  })
})

describe('r4 privacidad del codigo nuevo', () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  it.each(['./movements.ts', './debtMatch.ts', './saveMovement.ts', '../components/DetectedInbox.tsx'])('%s sin console, localStorage ni errores con datos', (f) => {
    const t = src(f)
    expect(t).not.toMatch(/console\.(log|info|warn|error|debug)/)
    expect(t).not.toMatch(/localStorage|sessionStorage/)
    expect(t).not.toMatch(/new Error\(`[^`]*\$\{/)
  })
  it('useDetected solo registra la clase del error', () => {
    for (const m of src('./useDetected.ts').matchAll(/logError\(([^)]*)\)/g)) expect(m[1]).toMatch(/^e, 'useDetected'$/)
  })
  it('el contador por enviar ignora ingresos y pagos CONFIRMED', async () => {
    const { pendingToSendCount } = await import('./nativeBridge')
    const list = [raw({ kind: 'INCOME', status: 'CONFIRMED', id: 'a' }), raw({ kind: 'DEBT_PAYMENT', status: 'CONFIRMED', id: 'b' }), raw({ kind: 'EXPENSE', status: 'CONFIRMED', id: 'c' })]
    expect(await pendingToSendCount({ listDrafts: async () => ({ drafts: list }) } as never)).toBe(1)
  })
})
