// Copyright (c) 2026 Dinovance
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { describeScan } from './scanOutcome'
import { parseRescan } from './nativeBridge'
import ScanButton, { ScanView } from '../components/ScanButton'

const h = vi.hoisted(() => ({ native: true, rescan: vi.fn() }))
vi.mock('./nativeBridge', async (orig) => ({ ...(await orig<typeof import('./nativeBridge')>()), isNativeApp: () => h.native, ContigoNative: { rescanNotifications: h.rescan } }))

import { onRescanned, resetRescan, scanNow } from './rescan'

const r = (o: object) => parseRescan({ processed: 0, connected: true, ...o })

describe('describeScan', () => {
  it('processed > 0: encontré N (singular y plural)', () => {
    expect(describeScan(r({ processed: 1 })).text).toBe('Encontré 1 movimiento')
    expect(describeScan(r({ processed: 3 })).text).toBe('Encontré 3 movimientos')
  })
  it('LISTENER_OFF o sin conexión: activar acceso', () => {
    for (const x of [r({ reason: 'LISTENER_OFF' }), parseRescan({ processed: 0, connected: false })]) {
      const o = describeScan(x)
      expect(o.text).toContain('Activa el acceso a notificaciones')
      expect(o.action).toEqual({ type: 'access', label: 'Activar acceso' })
    }
  })
  it('NO_BANK_APP: Elegir app', () => {
    const o = describeScan(r({ reason: 'NO_BANK_APP' }))
    expect(o.text).toBe('No encontré la app de tu banco.')
    expect(o.action).toEqual({ type: 'pick-app', label: 'Elegir app' })
  })
  it('NOTHING_ACTIVE y ONLY_SEEN: solo texto', () => {
    expect(describeScan(r({ reason: 'NOTHING_ACTIVE' }))).toMatchObject({ text: 'No hay avisos de tus bancos en la barra ahora. Cuando llegue el próximo, lo tomo solo.' })
    expect(describeScan(r({ reason: 'ONLY_SEEN' })).text).toBe('Ya habías visto los avisos que hay.')
    expect(describeScan(r({ reason: 'ONLY_SEEN' })).action).toBeUndefined()
  })
  it('versión vieja (solo processed/connected) y 0: mensaje genérico', () => {
    expect(describeScan(r({})).text).toContain('No encontré gastos nuevos')
  })
  it('otherApps > 0 sugiere revisar otras apps', () => {
    expect(describeScan(r({ reason: 'NOTHING_ACTIVE', otherApps: 2 })).hint?.text).toBe('Hay avisos de otras apps: ¿es alguna tu banco?')
    expect(describeScan(r({ reason: 'NOTHING_ACTIVE' })).hint).toBeUndefined()
  })
})

describe('parseRescan defensivo con campos nuevos', () => {
  it('ignora lo desconocido y lo inválido', () => {
    expect(parseRescan({ processed: 0, connected: true, reason: 'RARO', scanned: -1, otherApps: '3', extra: 1 })).toEqual({ processed: 0, connected: true })
    expect(parseRescan({ processed: 1, connected: true, reason: 'OK', scanned: 4, alreadySeen: 2, otherApps: 1 })).toEqual({ processed: 1, connected: true, reason: 'OK', scanned: 4, alreadySeen: 2, otherApps: 1 })
  })
})

describe('scanNow', () => {
  beforeEach(() => {
    resetRescan()
    h.native = true
    h.rescan.mockReset().mockResolvedValue({ processed: 2, connected: true })
  })
  it('fuera de la app nativa no llama', async () => {
    h.native = false
    expect(await scanNow()).toBeNull()
    expect(h.rescan).not.toHaveBeenCalled()
  })
  it('salta el límite de 10 s y refresca si processed > 0', async () => {
    const cb = vi.fn()
    onRescanned(cb)
    await scanNow()
    await scanNow()
    expect(h.rescan).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenCalledWith(2)
  })
  it('un fallo devuelve null sin lanzar', async () => {
    h.rescan.mockRejectedValue(new Error('x'))
    expect(await scanNow()).toBeNull()
  })
})

describe('ScanButton', () => {
  it('en la web no se muestra', () => {
    expect(renderToStaticMarkup(<ScanButton native={false} onPickApp={() => undefined} />)).toBe('')
  })
  it('en la app: botón principal «Buscar gastos ahora» y zona de estado accesible', () => {
    const html = renderToStaticMarkup(<ScanButton native onPickApp={() => undefined} />)
    expect(html).toContain('Buscar gastos ahora')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('disabled')
  })
  it('mientras busca: deshabilitado y con «Buscando…»', () => {
    const html = renderToStaticMarkup(<ScanView busy outcome={null} onScan={() => undefined} onAction={() => undefined} />)
    expect(html).toContain('disabled')
    expect(html).toContain('Buscando…')
  })
  it('el resultado y su botón se muestran en el role=status', () => {
    const html = renderToStaticMarkup(<ScanView busy={false} outcome={describeScan(r({ reason: 'NO_BANK_APP' }))} onScan={() => undefined} onAction={() => undefined} />)
    expect(html).toMatch(/role="status"[^>]*>[\s\S]*No encontré la app de tu banco[\s\S]*Elegir app/)
  })
})
