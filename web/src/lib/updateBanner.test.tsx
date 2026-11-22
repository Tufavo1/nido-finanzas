// Copyright (c) 2026 Dinovance
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bannerView } from './updateBanner'
import { updateErrorInfo } from './appUpdate'
import { UpdateBannerView } from '../components/NativeUpdateBanner'

const h = vi.hoisted(() => ({ native: true, check: vi.fn(), download: vi.fn(), install: vi.fn(), store: new Map<string, string>() }))
vi.mock('./nativeBridge', async (orig) => ({
  ...(await orig<typeof import('./nativeBridge')>()),
  isNativeApp: () => h.native,
  ContigoNative: { checkForUpdate: h.check, downloadUpdate: h.download, installUpdate: h.install, addListener: async () => ({ remove: async () => undefined }), openInstallSettings: async () => undefined },
}))
vi.stubGlobal('localStorage', { getItem: (k: string) => h.store.get(k) ?? null, setItem: (k: string, v: string) => void h.store.set(k, v), removeItem: (k: string) => void h.store.delete(k) })

import { checkUpdates, dismissBanner, postponeUpdate, setUpdateSuppressed, startUpdate } from './appUpdateStore'
import * as store from './appUpdateStore'

const base = { phase: 'idle', info: { available: true, versionName: '1.4.0' }, percent: null, error: null, dismissed: false, suppressed: false } as const
const noop = () => undefined
const html = (view: ReturnType<typeof bannerView>) => renderToStaticMarkup(<UpdateBannerView view={view} onUpdate={noop} onLater={noop} onAllow={noop} />)

describe('bannerView', () => {
  it('aparece solo si hay versión nueva y es la app nativa', () => {
    expect(bannerView(base, true)).toEqual({ kind: 'available', version: '1.4.0' })
    expect(bannerView({ ...base, info: { available: false } }, true).kind).toBe('hidden')
    expect(bannerView(base, false).kind).toBe('hidden')
  })
  it('«Después» lo oculta en la sesión', () => {
    expect(bannerView({ ...base, dismissed: true }, true).kind).toBe('hidden')
  })
  it('no se superpone con la hoja del primer aviso ni con «Conectar bancos»', () => {
    expect(bannerView({ ...base, phase: 'prompt' }, true).kind).toBe('hidden')
    expect(bannerView({ ...base, suppressed: true }, true).kind).toBe('hidden')
  })
  it('descargando muestra el avance; instalando, «listo»', () => {
    expect(bannerView({ ...base, phase: 'downloading', percent: 40 }, true)).toEqual({ kind: 'downloading', version: '1.4.0', percent: 40 })
    expect(bannerView({ ...base, phase: 'installing' }, true).kind).toBe('ready')
    expect(bannerView({ ...base, phase: 'downloading', dismissed: true }, true).kind).toBe('downloading')
  })
  it('errores con qué hacer', () => {
    const e = (code: string) => bannerView({ ...base, phase: 'error', error: updateErrorInfo({ code }) }, true)
    expect(e('NETWORK')).toMatchObject({ kind: 'error', text: 'Revisa tu conexión.', permission: false })
    expect(e('NO_SPACE')).toMatchObject({ text: 'Libera espacio.' })
    expect(e('CORRUPT')).toMatchObject({ text: 'Inténtalo de nuevo.' })
    expect(e('NEEDS_INSTALL_PERMISSION')).toMatchObject({ permission: true })
  })
})

describe('UpdateBannerView', () => {
  it('oculto: no renderiza nada', () => expect(html({ kind: 'hidden' })).toBe(''))
  it('disponible: región accesible, título con versión, «Actualizar» principal y «Después»', () => {
    const out = html({ kind: 'available', version: '1.4.0' })
    expect(out).toContain('role="region"')
    expect(out).toContain('Hay una versión nueva de Contigo (1.4.0)')
    expect(out).toContain('Actualizar')
    expect(out).toContain('Después')
    expect(out.match(/<button/g)).toHaveLength(2)
  })
  it('descargando: barra con porcentaje y aria-live, sin botones', () => {
    const out = html({ kind: 'downloading', version: '1', percent: 40 })
    expect(out).toContain('role="progressbar"')
    expect(out).toContain('aria-valuenow="40"')
    expect(out).toContain('aria-live="polite"')
    expect(out).toContain('Descargando… 40 %')
    expect(out).not.toContain('<button')
  })
  it('permiso: «Permitir» principal; otros errores: «Reintentar»', () => {
    expect(html({ kind: 'error', version: '1', text: 'Falta un permiso para instalar.', permission: true })).toContain('Permitir')
    const out = html({ kind: 'error', version: '1', text: 'Revisa tu conexión.', permission: false })
    expect(out).toContain('Revisa tu conexión.')
    expect(out).toContain('Reintentar')
  })
})

describe('store del banner', () => {
  beforeEach(() => {
    h.native = true
    h.store.clear()
    h.check.mockReset().mockResolvedValue({ available: true, versionName: '1.4.0' })
    h.download.mockReset().mockResolvedValue(undefined)
    h.install.mockReset().mockResolvedValue(undefined)
    dismissBanner()
    store.closeUpdate()
  })
  it('revisa en silencio y como máximo cada 6 h; un fallo no deja error', async () => {
    await checkUpdates()
    await checkUpdates()
    expect(h.check).toHaveBeenCalledTimes(1)
    h.store.clear()
    h.check.mockRejectedValue(new Error('x'))
    await checkUpdates()
    expect(h.check).toHaveBeenCalledTimes(2)
  })
  it('«Más tarde» de la hoja no lo oculta para siempre: el banner sigue mostrando la versión', async () => {
    await checkUpdates()
    postponeUpdate()
    expect(h.store.get('contigo-update-later')).toBe('1.4.0')
    setUpdateSuppressed(false)
  })
  it('descargar y abrir el instalador usa las funciones existentes', async () => {
    await checkUpdates()
    await startUpdate()
    expect(h.download).toHaveBeenCalledOnce()
    expect(h.install).toHaveBeenCalledOnce()
  })
})
