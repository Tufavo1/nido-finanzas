// Copyright (c) 2026 Dinovance
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { clearNoticesToast, clearUnreadNotices } from './nativeSettings'

const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('clearUnreadNotices: borra el diagnóstico local de «Avisos que no pude leer»', () => {
  it('con hora borra solo esa entrada y sin hora borra todas', async () => {
    const clear = vi.fn().mockResolvedValue({ removed: 1 })
    expect(await clearUnreadNotices({ clearDiagnostics: clear }, 1700000000000)).toBe('cleared')
    expect(clear).toHaveBeenLastCalledWith({ atMillis: 1700000000000 })
    expect(await clearUnreadNotices({ clearDiagnostics: clear })).toBe('cleared')
    expect(clear).toHaveBeenLastCalledWith({})
  })
  it('si el puente nativo aún no tiene el método, lo dice sin borrar otra cosa', async () => {
    expect(await clearUnreadNotices({})).toBe('unsupported')
    const unimplemented = vi.fn().mockRejectedValue({ code: 'UNIMPLEMENTED', message: 'not implemented' })
    expect(await clearUnreadNotices({ clearDiagnostics: unimplemented })).toBe('unsupported')
  })
  it('un fallo cualquiera queda como «failed»', async () => {
    expect(await clearUnreadNotices({ clearDiagnostics: vi.fn().mockRejectedValue(new Error('x')) })).toBe('failed')
  })
  it('textos en español sin jerga y sin texto crudo', () => {
    expect(clearNoticesToast('cleared')).toBeNull()
    expect(clearNoticesToast('unsupported')).toBe('Aún no se puede borrar\nActualiza Contigo para borrar estos avisos.')
    expect(clearNoticesToast('failed')).toBe('No se pudo borrar\nInténtalo de nuevo.')
  })
  it('nunca usa clearCaptured (borraría también los borradores)', () => {
    expect(src('./nativeSettings.ts')).not.toMatch(/clearUnreadNotices[\s\S]{0,600}clearCaptured/)
  })
})

describe('las dos listas de avisos tienen Borrar y Borrar todos en 2 toques', () => {
  for (const f of ['../components/AutoExpenses.tsx', '../components/CaptureDiagnostics.tsx']) {
    it(`${f}: botón Borrar por entrada y Borrar todos`, () => {
      const t = src(f)
      expect(t).toContain('Borrar')
      expect(t).toMatch(/useClearNotices|clearUnreadNotices/)
      expect(t).toContain('ClearAllNotices')
    })
  }
  it('ClearAllNotices pide confirmar con un segundo toque y vuelve solo', () => {
    const t = src('../components/ClearAllNotices.tsx')
    expect(t).toContain('Borrar todos')
    expect(t).toContain('Toca otra vez para borrar todos')
    expect(t).toMatch(/setTimeout/)
    expect(t).toMatch(/'btn danger small' : 'btn ghost small'/)
  })
})
