// Copyright (c) 2026 Dinovance
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DetectedInbox from './DetectedInbox'
import { DEFAULT_CAPTURE_CONFIG } from '../lib/captureConfig'
import type { NativeDraft } from '../lib/nativeBridge'

const noop = () => undefined
const base = { categories: [], history: [], onReview: noop, onSaveWith: async () => undefined, onIgnore: noop, onRetry: noop, onSettings: noop, kept: new Set<string>(), onKeepBoth: noop, failed: false }
const mk = (o: Partial<NativeDraft>): NativeDraft => ({ id: 'x1', amountClp: 34_400, merchant: null, kind: 'DEBT_PAYMENT', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: 1_700_000_000_000, createdAtMillis: 1, status: 'PENDING', ...o })
const render = (drafts: NativeDraft[], extra: object = {}) => renderToStaticMarkup(<DetectedInbox {...base} drafts={drafts} {...extra} />)

describe('Movimientos detectados', () => {
  it('título nuevo', () => {
    expect(render([])).toContain('Movimientos detectados')
  })
  it('gasto: muestra la cuenta en gris', () => {
    const html = render([mk({ kind: 'EXPENSE', merchant: 'Almacen', account: 'Débito Banco Falabella' })])
    expect(html).toContain('Con Débito Banco Falabella')
  })
  it('ingreso: se rotula «Ingreso extra», un botón principal y salida «entre mis cuentas»', () => {
    const html = render([mk({ kind: 'INCOME', account: 'Cuenta Banco Falabella ·2236', amountClp: 90_000 })], { onSaveIncome: async () => undefined })
    expect(html).toContain('Ingreso extra de')
    expect(html).toContain('Cuenta Banco Falabella ·2236')
    expect(html).toContain('Se guarda en «Ingresos extra»')
    expect(html).toContain('Si es un movimiento entre tus cuentas, no es un ingreso.')
    expect(html).toContain('Guardar en Ingresos extra')
    expect(html).toContain('Es entre mis cuentas')
  })
  it('ingreso: muestra lo que queda del mes solo si hay dato', () => {
    const d = mk({ kind: 'INCOME', amountClp: 90_000 })
    expect(render([d], { monthLeft: () => 500_000 })).toContain('Después de guardar te quedan $500.000 este mes.')
    expect(render([d], { monthLeft: () => null })).not.toContain('Después de guardar')
    expect(render([d])).not.toContain('Después de guardar')
  })
  it('pago de tarjeta: pregunta «¿A qué corresponde?» con tres caminos y un solo Guardar', () => {
    const html = render([mk({ account: 'CMR Mastercard Premium ·5766' })], { debts: [{ id: 'd1', name: 'CMR Premium' }, { id: 'd2', name: 'Auto' }], onPayDebt: async () => undefined })
    expect(html).toContain('Pago de tarjeta')
    expect(html).toContain('¿A qué corresponde?')
    expect(html).toContain('Pago de tarjeta o deuda')
    expect(html).toContain('Crear una deuda nueva')
    expect(html).toContain('Solo es un gasto')
    expect(html.match(/>Guardar</g)).toHaveLength(1)
    expect(html).toContain('Ignorar')
  })
  it('pago con coincidencia clara: la deuda queda preseleccionada y Guardar habilitado', () => {
    const html = render([mk({ account: 'CMR Mastercard Premium ·5766' })], { debts: [{ id: 'd1', name: 'CMR Premium' }, { id: 'd2', name: 'Auto' }] })
    expect(html).toMatch(/aria-checked="true"[^>]*>(<span[^>]*><\/span>)CMR Premium/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Guardar</)
  })
  it('pago sin coincidencia clara: ninguna deuda marcada y Guardar apagado con la razón a la vista', () => {
    const html = render([mk({ account: 'Banco Raro' })], { debts: [{ id: 'd1', name: 'Auto' }, { id: 'd2', name: 'Casa' }] })
    expect(html).toContain('¿Cuál deuda?')
    expect(html).toContain('Auto')
    expect(html).toContain('Casa')
    expect(html).toContain('Elige una deuda para guardar.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Guardar</)
    expect(html).toContain('aria-describedby="hint-x1"')
  })
  it('pago sin deudas: abre en «Crear una deuda nueva» con el nombre prellenado de la cuenta', () => {
    const html = render([mk({ account: 'CMR Mastercard Premium ·5766' })], { debts: [] })
    expect(html).toContain('Nombre de la deuda')
    expect(html).toContain('value="CMR Mastercard Premium ·5766"')
    expect(html).toContain('antes de este pago')
    expect(html).not.toContain('Ir a Dinero')
  })
  it('transferencia: dos caminos, «Es un gasto» por defecto, sin guardarse sola', () => {
    const html = render([mk({ kind: 'TRANSFER_OUT', merchant: 'Juan Perez', amountClp: 20_000 })], { debts: [{ id: 'd1', name: 'Auto' }], categories: [{ id: 'c1', name: 'Hogar' }] })
    expect(html).toContain('Transferencia $20.000')
    expect(html).toContain('A Juan Perez')
    expect(html).toContain('¿Es un gasto o el pago de una deuda?')
    expect(html).toMatch(/aria-checked="true"[^>]*>(<span[^>]*><\/span>)Es un gasto/)
    expect(html).toContain('Pago de una deuda')
    expect(html).toContain('Elige una categoría para guardar.')
    expect(html).not.toContain('Crear una deuda nueva')
  })
  it('lo que queda del mes se muestra solo con dato y nunca inventado', () => {
    const d = mk({ kind: 'TRANSFER_OUT', merchant: 'Juan' })
    expect(render([d], { debts: [], monthLeft: () => 120_000 })).toContain('Después de guardar te quedan $120.000 este mes.')
    expect(render([d], { debts: [], monthLeft: () => -5_000 })).toContain('te faltarían $5.000')
    expect(render([d], { debts: [], monthLeft: () => null })).not.toContain('Después de guardar')
  })
  it('ingresos y pagos no llevan aviso de duplicado', () => {
    const a = mk({ kind: 'INCOME', id: 'a' })
    const b = mk({ kind: 'INCOME', id: 'b', createdAtMillis: 2, possibleDuplicate: true })
    expect(render([a, b])).not.toContain('Posible duplicado')
  })
  it('config por defecto sigue disponible (sin cambios)', () => {
    expect(DEFAULT_CAPTURE_CONFIG.mode).toBeDefined()
  })
})

describe('UX: una acción principal por tarjeta, resto secundario', () => {
  const buttonsOutsideMore = (html: string) => html.replace(/<details[\s\S]*?<\/details>/g, '').match(/<button[^>]*>/g) ?? []
  const primaries = (btns: string[]) => btns.filter((b) => !/ghost|danger|switch|role="radio"/.test(b))
  const cards = (html: string) => html.split('<section').slice(1).filter((c) => c.includes('card detected'))
  it('cada tarjeta tiene exactamente 1 acción principal (las opciones tipo radio no cuentan) y exactamente 1 principal', () => {
    const html = render([mk({ kind: 'EXPENSE', merchant: 'Almacen', id: 'e' }), mk({ kind: 'INCOME', id: 'i' }), mk({ id: 'p', account: 'CMR' })], { debts: [{ id: 'd1', name: 'CMR Premium' }], onPayDebt: async () => undefined })
    const cs = cards(html)
    expect(cs).toHaveLength(3)
    for (const c of cs) {
      const btns = buttonsOutsideMore(c)
      expect(btns.filter((b) => !/role="radio"/.test(b)).length).toBeLessThanOrEqual(3)
      expect(primaries(btns)).toHaveLength(1)
    }
  })
  it('las opciones extra del gasto quedan en «Más opciones», cerrado por defecto', () => {
    const html = render([mk({ kind: 'EXPENSE', merchant: 'Almacen' })])
    expect(html).toContain('<details class="more">')
    expect(html).not.toMatch(/<details[^>]*\sopen/)
    expect(html).toContain('Más opciones')
  })
  it('con más de un tipo hay encabezados por grupo; con uno solo no', () => {
    expect(render([mk({ kind: 'INCOME' }), mk({ id: 'z' })])).toMatch(/Ingresos[\s\S]*Pagos de tarjeta/)
    expect(render([mk({ kind: 'INCOME' })])).not.toContain('mov-title')
  })
})

describe('pago con varias deudas: opciones tipo radio', () => {
  const html = render([mk({ account: 'CMR Mastercard Premium' })], { debts: [{ id: 'd1', name: 'Auto' }, { id: 'd2', name: 'Casa' }], onPayDebt: async () => undefined })
  it('dos radiogroups (a qué corresponde y cuál deuda), cada uno con a lo más una opción marcada y una sola parada de tabulación', () => {
    expect(html.match(/role="radiogroup"/g)).toHaveLength(2)
    expect(html.match(/role="radio"/g)).toHaveLength(5)
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(html.match(/tabindex="0"/g)).toHaveLength(2)
  })
  it('elegir no guarda: un solo botón principal «Guardar»', () => {
    expect(html.replace(/<button[^>]*role="radio"[\s\S]*?<\/button>/g, '').match(/<button[^>]*>/g)!.filter((b) => !/ghost|switch/.test(b))).toHaveLength(1)
  })
})
