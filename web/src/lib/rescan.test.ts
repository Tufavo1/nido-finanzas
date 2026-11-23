// Copyright (c) 2026 Dinovance
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ native: true, rescan: vi.fn() }))
vi.mock('./nativeBridge', async (orig) => ({
  ...(await orig<typeof import('./nativeBridge')>()),
  isNativeApp: () => h.native,
  ContigoNative: { rescanNotifications: h.rescan },
}))

import { parseRescan } from './nativeBridge'
import { onRescanned, rescanNow, resetRescan } from './rescan'

beforeEach(() => {
  resetRescan()
  h.native = true
  h.rescan.mockReset().mockResolvedValue({ processed: 0, connected: true })
})

describe('rescanNow', () => {
  it('fuera de la app nativa no llama al plugin', async () => {
    h.native = false
    expect(await rescanNow()).toBe(0)
    expect(h.rescan).not.toHaveBeenCalled()
  })
  it('máximo una vez cada 10 s', async () => {
    await rescanNow({ now: 1_000 })
    await rescanNow({ now: 5_000 })
    expect(h.rescan).toHaveBeenCalledTimes(1)
    await rescanNow({ now: 11_001 })
    expect(h.rescan).toHaveBeenCalledTimes(2)
  })
  it('force salta el límite', async () => {
    await rescanNow({ now: 1_000 })
    await rescanNow({ now: 2_000, force: true })
    expect(h.rescan).toHaveBeenCalledTimes(2)
  })
  it('un fallo es silencioso: no lanza y devuelve 0', async () => {
    h.rescan.mockRejectedValue(new Error('boom'))
    await expect(rescanNow({ now: 1 })).resolves.toBe(0)
  })
  it('processed > 0 avisa para refrescar la bandeja; 0 no', async () => {
    const cb = vi.fn()
    onRescanned(cb)
    await rescanNow({ now: 1 })
    expect(cb).not.toHaveBeenCalled()
    h.rescan.mockResolvedValue({ processed: 3, connected: true })
    expect(await rescanNow({ now: 20_000 })).toBe(3)
    expect(cb).toHaveBeenCalledWith(3)
  })
  it('no se solapan dos relecturas', async () => {
    let done!: () => void
    h.rescan.mockReturnValue(new Promise((r) => (done = () => r({ processed: 0, connected: true }))))
    const a = rescanNow({ now: 1 })
    await rescanNow({ now: 50_000 })
    done()
    await a
    expect(h.rescan).toHaveBeenCalledTimes(1)
  })
})

describe('parseRescan', () => {
  it('es defensivo', () => {
    expect(parseRescan({ processed: 2, connected: true })).toEqual({ processed: 2, connected: true })
    for (const bad of [null, 'x', {}, { processed: -1 }, { processed: 1.5 }, { processed: '3' }, { processed: 1e9 }]) expect(parseRescan(bad).processed).toBe(0)
    expect(parseRescan({ processed: 1, connected: 'sí' }).connected).toBe(false)
  })
})
