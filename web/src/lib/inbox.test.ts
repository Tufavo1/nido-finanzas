import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTURE_CONFIG } from './captureConfig'
import { draftExpenseId } from './draftExpenseId'
import { draftCategoryId, expenseRow, planDrafts, withoutSavedDrafts } from './inbox'
import { candidateToDraft } from './candidates'
import { parseNativeDraft } from './nativeBridge'
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
  it('un gasto confirmado con comercio nuevo se guarda solo (no queda mudo en la bandeja)', () => {
    const cats = { categories: [{ id: 'c1', name: 'Supermercado' }, { id: 'o', name: 'Otros' }], history: [] }
    const p = planDrafts([draft({ id: 'x', status: 'CONFIRMED', merchant: 'Prueba-Emu Tienda', amountClp: 30_000 })], DEFAULT_CAPTURE_CONFIG, cats, new Set())
    expect(p.auto.map((d) => d.id)).toEqual(['x'])
    expect(draftCategoryId(p.auto[0]!, cats.categories, cats.history)).toBe('o')
  })
  it('sin categorías en el hogar un confirmado espera en la bandeja (no hay dónde guardarlo)', () => {
    const p = planDrafts([draft({ id: 'x', status: 'CONFIRMED' })], DEFAULT_CAPTURE_CONFIG, { categories: [], history: [] }, new Set())
    expect(p.ask.map((d) => d.id)).toEqual(['x'])
  })
  it('un ingreso confirmado no se guarda solo en el web (lo envía el teléfono)', () => {
    const p = planDrafts([draft({ id: 'i', kind: 'INCOME', status: 'CONFIRMED' })], DEFAULT_CAPTURE_CONFIG, ctx, new Set())
    expect(p.auto).toEqual([])
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
  it('una compra en cuotas PENDIENTE nunca se guarda sola, ni en modo automático', () => {
    const cfg = { ...DEFAULT_CAPTURE_CONFIG, mode: 'AUTO' as const }
    for (const role of ['PURCHASE', 'PRIOR_CHARGE'] as const) {
      const p = planDrafts([draft({ id: 'a', installmentRole: role })], cfg, ctx, new Set())
      expect(p.auto).toEqual([])
      expect(p.ask.map((d) => d.id)).toEqual(['a'])
    }
  })
  it('CMR: compra confirmada en la notificación con el total ($30.000 en 3 cuotas de $10.000) se guarda una vez', () => {
    const cmr = draft({ id: 'cmr', amountClp: 30_000, merchant: 'Almacen Demo', status: 'CONFIRMED', installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000 })
    const p = planDrafts([cmr], DEFAULT_CAPTURE_CONFIG, ctx, new Set())
    expect(p.auto.map((d) => d.id)).toEqual(['cmr'])
    const form = candidateToDraft(cmr, { paidBy: 'u1', shared: false, categories: ctx.categories, history: ctx.history })
    expect(form).toMatchObject({ amount: 30_000, note: 'Almacen Demo (3 cuotas de $10.000)', shared: false, paymentMethod: 'tarjeta', category_id: 'c1' })
    const row = expenseRow('h1', draftExpenseId('cmr'), form, 'u1')
    expect(row).toMatchObject({ amount: 30_000, paid_by: 'u1', shared: false, payment_method: 'tarjeta' })
  })
  it('confirmada pero sin total (solo una cuota) o cobro de una cuota anterior: nunca se guarda sola', () => {
    const sinTotal = draft({ id: 'a', amountClp: 10_000, status: 'CONFIRMED', installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000 })
    const conCuota = draft({ id: 'b', amountClp: 10_000, status: 'CONFIRMED', installmentRole: 'PURCHASE', installment: { n: 1, total: 3 } })
    const previo = draft({ id: 'c', status: 'CONFIRMED', installmentRole: 'PRIOR_CHARGE' })
    const p = planDrafts([sinTotal, conCuota, previo], DEFAULT_CAPTURE_CONFIG, ctx, new Set())
    expect(p.auto).toEqual([])
    expect(p.ask.map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })
  it('un borrador normal que el teléfono manda con installmentRole null no cuenta como cuotas', () => {
    const parsed = parseNativeDraft({ ...draft({ id: 'n', status: 'CONFIRMED' }), installmentRole: null, installmentCount: null, installmentValueClp: null })
    expect(parsed).not.toBeNull()
    expect(parsed).not.toHaveProperty('installmentRole')
    expect(planDrafts([parsed as NativeDraft], DEFAULT_CAPTURE_CONFIG, ctx, new Set()).auto.map((d) => d.id)).toEqual(['n'])
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

describe('planDrafts: el interruptor del banco manda sobre el modo automático global', () => {
  it('un borrador de un banco con el guardado apagado se pregunta aunque el modo global esté encendido', () => {
    const cfg = { ...DEFAULT_CAPTURE_CONFIG, mode: 'AUTO' as const }
    const base = draft({ id: 'b', status: 'PENDING', bankAutoOff: true })
    expect(planDrafts([base], cfg, ctx, new Set()).auto).toEqual([])
    expect(planDrafts([base], cfg, ctx, new Set()).ask).toHaveLength(1)
  })
})

describe('withoutSavedDrafts: no mostrar como pendiente lo que ya está guardado', () => {
  const U1 = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b'
  const U2 = '4a3c9d2f-6b5e-4f7a-8b2c-3d4e5f6a7b8c'
  const auto = (id: string, status: 'pending' | 'synced' | 'rejected') => ({ id, amount: 12_000, note: 'Almacen Demo', at: 1, synced: status === 'synced', status, kind: 'expense' as const })

  it('un gasto autoguardado que aún sincroniza (pending) no sale también como pendiente', () => {
    const out = withoutSavedDrafts([draft({ id: U1 }), draft({ id: U2 })], [auto(U1, 'pending')], new Set())
    expect(out.map((d) => d.id)).toEqual([U2])
  })
  it('también si ya está sincronizado', () => {
    expect(withoutSavedDrafts([draft({ id: U1 })], [auto(U1, 'synced')], new Set())).toEqual([])
  })
  it('si el servidor lo rechazó, sí queda para que la persona lo revise', () => {
    expect(withoutSavedDrafts([draft({ id: U1 })], [auto(U1, 'rejected')], new Set()).map((d) => d.id)).toEqual([U1])
  })
  it('si el gasto ya está en la lista de gastos del servidor (mismo id), tampoco sale pendiente', () => {
    expect(withoutSavedDrafts([draft({ id: U1 })], [], new Set([draftExpenseId(U1)]))).toEqual([])
  })
  it('un borrador distinto con mismo monto y comercio NO se oculta (puede ser otra compra)', () => {
    expect(withoutSavedDrafts([draft({ id: U2 })], [auto(U1, 'pending')], new Set()).map((d) => d.id)).toEqual([U2])
  })
})

describe('draftCategoryId: la misma categoría desde el teléfono y desde el web', () => {
  const cats = [{ id: 'sup', name: 'Supermercado' }, { id: 'fa', name: 'Salud' }, { id: 'o', name: 'Otros' }]
  it('usa la categoría que ya trae el borrador', () => {
    expect(draftCategoryId(draft({ id: 'a', categoryId: 'fa', merchant: 'Prueba-Emu Tienda' }), cats, [])).toBe('fa')
  })
  it('ignora una categoryId que ya no existe en el hogar', () => {
    expect(draftCategoryId(draft({ id: 'a', categoryId: 'borrada', merchant: 'Prueba-Emu Tienda' }), cats, [])).toBe('o')
  })
  it('comercio conocido por palabra clave: su categoría', () => {
    expect(draftCategoryId(draft({ id: 'a', merchant: 'Farmacia Demo' }), cats, [])).toBe('fa')
  })
  it('comercio aprendido: la categoría del historial', () => {
    expect(draftCategoryId(draft({ id: 'a', merchant: 'Almacen Demo' }), cats, [{ note: 'Almacen Demo', category_id: 'sup' }])).toBe('sup')
  })
  it('comercio nuevo $30.000: Otros', () => {
    expect(draftCategoryId(draft({ id: 'a', merchant: 'Prueba-Emu Tienda', amountClp: 30_000 }), cats, [])).toBe('o')
  })
  it('sin comercio: Otros', () => {
    expect(draftCategoryId(draft({ id: 'a', merchant: null }), cats, [])).toBe('o')
  })
  it('si el teléfono dejó la general («Otros») y la palabra clave dice otra, gana la palabra clave', () => {
    expect(draftCategoryId(draft({ id: 'a', categoryId: 'o', merchant: 'PRUEBA-EMU FARMACIA' }), cats, [])).toBe('fa')
  })
  it('si el teléfono dejó la general y no hay palabra clave, se queda en la general', () => {
    expect(draftCategoryId(draft({ id: 'a', categoryId: 'o', merchant: 'Prueba-Emu Tienda' }), cats, [])).toBe('o')
  })
  it('sin categorías: null', () => {
    expect(draftCategoryId(draft({ id: 'a' }), [], [])).toBeNull()
  })
})
