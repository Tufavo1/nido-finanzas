// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { buildCrashReport, buildErrorReport, buildHealthReport, sanitizeFrames, sendPendingCrashReports, type ClientErrorReport } from './clientReport'

const ctx = { source: 'android' as const, appVersion: '1.2.0', screen: 'inicio', correlationId: 'abcd1234-ef56' }

describe('buildErrorReport', () => {
  it('usa solo el código tipado y nunca el mensaje ni los datos', () => {
    const r = buildErrorReport({ status: 500, error: { message: 'Compra de $12.990 token=abc persona@correo.cl' } }, ctx)
    expect(r).toEqual({ p_source: 'android', p_app_version: '1.2.0', p_screen: 'inicio', p_error_code: 'SERVER', p_correlation_id: 'abcd1234-ef56', p_stack_top: null })
    expect(JSON.stringify(r)).not.toMatch(/12\.990|token|persona/)
  })

  it('pantalla, versión o correlación con formato dudoso se descartan', () => {
    const r = buildErrorReport(new TypeError('Failed to fetch'), { source: 'web', appVersion: 'v 1 !', screen: 'persona@correo.cl', correlationId: 'no es hex' })
    expect(r).toMatchObject({ p_error_code: 'OFFLINE', p_app_version: 'desconocida', p_screen: null, p_correlation_id: null })
  })
})

describe('sanitizeFrames / buildCrashReport', () => {
  it('conserva marcos válidos y descarta texto libre', () => {
    expect(sanitizeFrames(['cl.dinovance.Foo.bar(Foo.kt:10)', 'Compra de $12.990 en Almacen', 'java.lang.Thread.run(Thread.java:1)'])).toBe(
      'cl.dinovance.Foo.bar(Foo.kt:10)\njava.lang.Thread.run(Thread.java:1)',
    )
    expect(sanitizeFrames(['12.990'])).toBeNull()
  })

  it('respeta el tope de 1500 caracteres', () => {
    const frames = Array.from({ length: 200 }, (_, i) => `cl.dinovance.Clase${i}.metodo(Archivo.kt:${i})`)
    expect(sanitizeFrames(frames)!.length).toBeLessThanOrEqual(1500)
  })

  it('el cierre inesperado lleva el código APP_CRASH y la pila sin mensaje', () => {
    const r = buildCrashReport({ at: 1, appVersion: '1.2.0', errorClass: 'java.lang.IllegalStateException', frames: ['cl.dinovance.Foo.bar(Foo.kt:10)'] }, { source: 'android' })
    expect(r).toMatchObject({ p_error_code: 'APP_CRASH', p_app_version: '1.2.0', p_stack_top: 'java.lang.IllegalStateException\ncl.dinovance.Foo.bar(Foo.kt:10)' })
  })
})

describe('sendPendingCrashReports', () => {
  const crash = { at: 1, appVersion: '1.2.0', errorClass: 'java.lang.IllegalStateException', frames: ['a.B.c(B.kt:1)'] }
  const plugin = (reports: unknown[]) => {
    const state = { cleared: false }
    return { state, plugin: { peekCrashReports: async () => ({ reports }), clearCrashReports: async () => void (state.cleared = true) } }
  }

  it('envía todos y recién entonces borra el registro local', async () => {
    const { state, plugin: p } = plugin([crash, crash, { basura: true }])
    const sent: ClientErrorReport[] = []
    const r = await sendPendingCrashReports(p, async (a) => (sent.push(a), { error: null }))
    expect(r).toEqual({ sent: 2, kept: 0 })
    expect(state.cleared).toBe(true)
  })

  it('si el servidor rechaza uno, conserva el registro para el próximo arranque', async () => {
    const { state, plugin: p } = plugin([crash, crash])
    let n = 0
    const r = await sendPendingCrashReports(p, async () => (++n === 2 ? { error: { message: 'x' } } : { error: null }))
    expect(r).toEqual({ sent: 1, kept: 1 })
    expect(state.cleared).toBe(false)
  })

  it('sin reportes no hace nada', async () => {
    const { state, plugin: p } = plugin([])
    expect(await sendPendingCrashReports(p, async () => ({ error: null }))).toEqual({ sent: 0, kept: 0 })
    expect(state.cleared).toBe(false)
  })
})

describe('buildHealthReport', () => {
  it('solo reporta cuando el permiso se revocó', () => {
    expect(buildHealthReport(false, ctx)).toBeNull()
    expect(buildHealthReport(true, ctx)).toMatchObject({ p_error_code: 'LISTENER_REVOKED', p_source: 'android' })
  })
})
