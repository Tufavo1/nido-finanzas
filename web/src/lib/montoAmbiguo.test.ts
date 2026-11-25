// Copyright (c) 2026 Dinovance
// Recorrido del emulador (PRUEBA-EMU) en la lógica del front: JSON del borrador tal como lo entrega el plugin
// (Draft.toJson de Kotlin + bankAutoOff) -> parseNativeDraft -> planDrafts -> fila a guardar. Datos SINTÉTICOS.
import { describe, expect, it } from 'vitest'
import { candidateToDraft } from './candidates'
import { DEFAULT_CAPTURE_CONFIG } from './captureConfig'
import { expenseRow, planDrafts } from './inbox'
import { parseNativeDraft } from './nativeBridge'
import type { NativeDraft } from './nativeBridge'

const auto = { ...DEFAULT_CAPTURE_CONFIG, mode: 'AUTO' as const, maxClp: 50_000 }
const ctx = {
  categories: [{ id: 'c1', name: 'Ocio' }],
  history: [{ note: 'PRUEBA-EMU Cafe', category_id: 'c1' }, { note: 'PRUEBA-EMU Kiosco', category_id: 'c1' }],
}

// Lo que manda listDrafts para «Compra por $4.900 en PRUEBA-EMU Cafe, comision $9.900» (queda PENDING en el teléfono)
const fromPlugin = {
  id: 'd-cafe', amountClp: 4_900, merchant: 'PRUEBA-EMU Cafe', kind: 'EXPENSE', confidence: 'HIGH', installment: null,
  fingerprint: 'fp', account: null, medium: 'UNKNOWN', postedAtMillis: 1_795_273_230_000, createdAtMillis: 1_795_273_230_000,
  status: 'PENDING', sourcePackage: 'cl.demo.banco', ownerKey: 'u1:h1', possibleDuplicate: false, categoryId: null,
  autoSaved: false, syncRejected: false, ambiguousAmount: true, bankAutoOff: false,
}

const plan = (raw: unknown) => planDrafts([parseNativeDraft(raw) as NativeDraft], auto, ctx, new Set())

describe('monto ambiguo: nunca se guarda solo con la app abierta', () => {
  it('el contrato conserva ambiguousAmount y lo omite si no viene o no es true', () => {
    expect(parseNativeDraft(fromPlugin)).toMatchObject({ ambiguousAmount: true })
    const { ambiguousAmount: _omit, ...old } = fromPlugin
    expect(parseNativeDraft(old)).not.toHaveProperty('ambiguousAmount')
    expect(parseNativeDraft({ ...fromPlugin, ambiguousAmount: 'si' })).not.toHaveProperty('ambiguousAmount')
  })
  it('compra y comisión en el mismo aviso: queda en la bandeja aunque el modo automático esté encendido', () => {
    const p = plan(fromPlugin)
    expect(p.auto).toEqual([])
    expect(p.ask.map((d) => d.id)).toEqual(['d-cafe'])
  })
  it('un borrador viejo sin el campo se comporta como antes (se guarda solo si cumple las reglas)', () => {
    const { ambiguousAmount: _omit, ...old } = fromPlugin
    expect(plan(old).auto.map((d) => d.id)).toEqual(['d-cafe'])
  })
  it('un posible duplicado tampoco se guarda solo: la persona decide', () => {
    expect(plan({ ...fromPlugin, ambiguousAmount: false, possibleDuplicate: true }).auto).toEqual([])
  })
  it('lo que la persona ya confirmó en la notificación se guarda aunque el monto fuera dudoso (ella lo vio)', () => {
    expect(plan({ ...fromPlugin, status: 'CONFIRMED' }).auto.map((d) => d.id)).toEqual(['d-cafe'])
  })
})

// Aviso viejo reentregado (la fecha de su texto es de otro día): el teléfono lo deja PENDING y el front tampoco lo guarda solo
describe('aviso viejo reentregado: nunca se guarda solo con la app abierta', () => {
  const stale = { ...fromPlugin, ambiguousAmount: false, staleDate: true }
  it('el contrato conserva staleDate y lo omite si no viene o no es true', () => {
    expect(parseNativeDraft(stale)).toMatchObject({ staleDate: true })
    expect(parseNativeDraft(fromPlugin)).not.toHaveProperty('staleDate')
    expect(parseNativeDraft({ ...stale, staleDate: 1 })).not.toHaveProperty('staleDate')
  })
  it('queda en la bandeja aunque el modo automático esté encendido', () => {
    expect(plan(stale).auto).toEqual([])
    expect(plan(stale).ask.map((d) => d.id)).toEqual(['d-cafe'])
  })
})

// Segundo caso: «Compraste con tu Visa $3.200 en PRUEBA-EMU Kiosco». Visa a secas no dice crédito (M2): gasto normal.
describe('Visa sin «crédito» es un gasto normal', () => {
  const visa = { ...fromPlugin, id: 'd-kiosco', amountClp: 3_200, merchant: 'PRUEBA-EMU Kiosco', account: 'Visa', medium: 'UNKNOWN', ambiguousAmount: false }
  it('se guarda solo bajo el tope y sin payment_method tarjeta', () => {
    const p = plan(visa)
    expect(p.auto.map((d) => d.id)).toEqual(['d-kiosco'])
    const form = candidateToDraft(p.auto[0], { paidBy: 'u1', shared: false, categories: ctx.categories, history: ctx.history })
    const row = expenseRow('h1', 'id-1', form, 'u1')
    expect(row).not.toHaveProperty('payment_method')
    expect(row).toMatchObject({ amount: 3_200, category_id: 'c1', shared: false })
  })
})
