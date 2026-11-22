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
  it('ingreso: pregunta, ayuda y los dos botones', () => {
    const html = render([mk({ kind: 'INCOME', account: 'Cuenta Banco Falabella ·2236', amountClp: 90_000 })], { onSaveIncome: async () => undefined })
    expect(html).toContain('Ingreso de')
    expect(html).toContain('Cuenta Banco Falabella ·2236')
    expect(html).toContain('¿Es plata tuya que entró?')
    expect(html).toContain('Si es un movimiento entre tus cuentas, no es un ingreso.')
    expect(html).toContain('Sí, es un ingreso')
    expect(html).toContain('No, es entre mis cuentas')
  })
  it('pago con una deuda clara: botón de un toque e Ignorar', () => {
    const html = render([mk({ account: 'CMR Mastercard Premium ·5766' })], { debts: [{ id: 'd1', name: 'CMR Premium' }, { id: 'd2', name: 'Auto' }], onPayDebt: async () => undefined })
    expect(html).toContain('Pago de tarjeta')
    expect(html).toContain('Los pagos de tu tarjeta no cuentan como gasto: tus compras ya están registradas.')
    expect(html).toContain('Registrar pago en «CMR Premium»')
    expect(html).toContain('Ignorar')
  })
  it('pago con varias o ninguna clara: lista para elegir y No es de mis deudas', () => {
    const html = render([mk({ account: 'CMR Mastercard Premium' })], { debts: [{ id: 'd1', name: 'Auto' }, { id: 'd2', name: 'Casa' }] })
    expect(html).toContain('Elige a qué deuda va')
    expect(html).toContain('Auto')
    expect(html).toContain('Casa')
    expect(html).toContain('No es de mis deudas')
    expect(html).not.toContain('Registrar pago en')
  })
  it('pago sin deudas: aviso, ir a Dinero e Ignorar', () => {
    const html = render([mk({})], { debts: [], onGoMoney: noop })
    expect(html).toContain('No tienes una deuda parecida. Puedes crearla en Dinero.')
    expect(html).toContain('Ir a Dinero')
    expect(html).toContain('Ignorar')
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
  const primaries = (btns: string[]) => btns.filter((b) => !/ghost|danger|switch/.test(b))
  const cards = (html: string) => html.split('<section').slice(1).filter((c) => c.includes('card detected'))
  it('cada tarjeta tiene a lo más 2 acciones visibles y exactamente 1 principal', () => {
    const html = render([mk({ kind: 'EXPENSE', merchant: 'Almacen', id: 'e' }), mk({ kind: 'INCOME', id: 'i' }), mk({ id: 'p', account: 'CMR' })], { debts: [{ id: 'd1', name: 'CMR Premium' }], onPayDebt: async () => undefined })
    const cs = cards(html)
    expect(cs).toHaveLength(3)
    for (const c of cs) {
      const btns = buttonsOutsideMore(c)
      expect(btns.length).toBeLessThanOrEqual(2)
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
  it('radiogroup con una sola opción marcada (la más probable) y un solo botón principal «Registrar pago»', () => {
    expect(html).toContain('role="radiogroup"')
    expect(html.match(/role="radio"/g)).toHaveLength(2)
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/Registrar pago/g)).toHaveLength(1)
    expect(html).toContain('No es de mis deudas')
  })
  it('elegir no registra: ningún guardado hasta tocar «Registrar pago»', () => {
    // las opciones son role=radio, no botones de acción
    expect(html.replace(/<button[^>]*role="radio"[\s\S]*?<\/button>/g, '').match(/<button[^>]*>/g)!.filter((b) => !/ghost|switch/.test(b))).toHaveLength(1)
  })
})
