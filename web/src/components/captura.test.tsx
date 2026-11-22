import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import UnsentBanner from './UnsentBanner'
import CaptureSettings from './CaptureSettings'
import DetectedInbox from './DetectedInbox'
import { DEFAULT_CAPTURE_CONFIG } from '../lib/captureConfig'
import type { NativeDraft } from '../lib/nativeBridge'

const noop = () => undefined
const cats = [{ id: 'c1', name: 'Supermercado' }]
const history = [{ note: 'Almacen Demo', category_id: 'c1' }]
const draft: NativeDraft = { id: 'd1', amountClp: 12_990, merchant: 'Almacen Demo', kind: 'EXPENSE', confidence: 'HIGH', installment: { n: 1, total: 3 }, fingerprint: 'f', postedAtMillis: 1_700_000_000_000, createdAtMillis: 1, status: 'PENDING' }
const base = { categories: cats, history, onReview: noop, onSaveWith: async () => undefined, onIgnore: noop, onRetry: noop, onSettings: noop, kept: new Set<string>(), onKeepBoth: noop }

describe('DetectedInbox', () => {
  it('cargando: muestra un skeleton, no una pantalla en blanco', () => {
    const html = renderToStaticMarkup(<DetectedInbox {...base} drafts={null} failed={false} />)
    expect(html).toContain('aria-busy="true"')
  })
  it('sin gastos: estado vacío con guía', () => {
    const html = renderToStaticMarkup(<DetectedInbox {...base} drafts={[]} failed={false} />)
    expect(html).toContain('No hay gastos por confirmar')
  })
  it('con error y sin datos: mensaje claro y Reintentar', () => {
    const html = renderToStaticMarkup(<DetectedInbox {...base} drafts={[]} failed />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Reintentar')
  })
  it('cada gasto muestra monto, comercio, categoría sugerida, cuota y las tres acciones', () => {
    const html = renderToStaticMarkup(<DetectedInbox {...base} drafts={[draft]} failed={false} />)
    expect(html).toContain('Almacen Demo')
    expect(html).toContain('Categoría sugerida: Supermercado')
    expect(html).toContain('Cuota 1 de 3')
    for (const a of ['Revisar y guardar', 'Cambiar categoría', 'Ignorar']) expect(html).toContain(a)
  })
})

describe('CaptureSettings en el navegador', () => {
  it('explica que la captura solo está en la app del teléfono', () => {
    const html = renderToStaticMarkup(<CaptureSettings config={DEFAULT_CAPTURE_CONFIG} onConfig={async () => undefined} onToast={noop} onCleared={noop} onSendNow={async () => undefined} />)
    expect(html).toContain('Solo está en la app del teléfono')
  })
})

describe('posibles duplicados (H-04)', () => {
  const twin: NativeDraft = { ...draft, id: 'd2', createdAtMillis: 2 }
  it('el segundo gasto igual se marca con explicación y las dos salidas', () => {
    const html = renderToStaticMarkup(<DetectedInbox {...base} drafts={[draft, twin]} failed={false} />)
    expect(html.match(/Posible duplicado/g)).toHaveLength(1)
    expect(html).toContain('tú decides')
    expect(html).toContain('Conservar ambos')
    expect(html).toContain('Descartar este')
  })
  it('si la persona eligió conservar ambos, ya no se marca', () => {
    const html = renderToStaticMarkup(<DetectedInbox {...base} drafts={[draft, twin]} failed={false} kept={new Set(['d2'])} />)
    expect(html).not.toContain('Posible duplicado')
  })
})

describe('UnsentBanner (H-05)', () => {
  it('con gastos por enviar avisa y ofrece Enviar ahora', () => {
    const html = renderToStaticMarkup(<UnsentBanner count={2} onSend={async () => undefined} />)
    expect(html).toContain('Tienes 2 gastos por enviar')
    expect(html).toContain('Enviar ahora')
    expect(html).toContain('role="status"')
  })
  it('sin gastos pendientes no dibuja nada', () => {
    expect(renderToStaticMarkup(<UnsentBanner count={0} onSend={async () => undefined} />)).toBe('')
  })
})

describe('origen del gasto', () => {
  it('muestra «Detectado desde» con el nombre visible de la app', () => {
    const html = renderToStaticMarkup(<DetectedInbox {...base} drafts={[{ ...draft, sourcePackage: 'cl.banco.app' }]} failed={false} appNames={new Map([['cl.banco.app', 'Banco Demo']])} />)
    expect(html).toContain('Detectado desde Banco Demo')
  })
  it('sin paquete de origen no dice nada', () => {
    expect(renderToStaticMarkup(<DetectedInbox {...base} drafts={[draft]} failed={false} />)).not.toContain('Detectado desde')
  })
})

describe('guardados automáticamente en la bandeja', () => {
  it('se marcan «Guardado automático» y ofrecen Deshacer', () => {
    const html = renderToStaticMarkup(<DetectedInbox {...base} drafts={[]} failed={false} autoSaved={[{ id: 'x', amount: 4_500, note: 'Cafe Demo', at: 1, synced: false }]} onUndoAuto={noop} />)
    expect(html).toContain('Guardado automático')
    expect(html).toContain('Deshacer')
    expect(html).toContain('Cafe Demo')
    expect(html).toContain('se enviará solo')
  })
})
