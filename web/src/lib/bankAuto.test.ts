import { describe, expect, it } from 'vitest'
import { BANKS, CAPTURE_AVAILABLE, CAPTURE_AVAILABLE_TEXT, DEFAULT_PARTNER_THRESHOLD, bankStatus, parseBankPresets, parseSyncState, parseThreshold, syncNeedsSignIn, syncSummary } from './bankAuto'

describe('BANKS', () => {
  it('siguen definidos los cuatro bancos y Billetera de Google (no se borran: el dueño los reactiva uno a uno)', () => {
    expect(BANKS.map((b) => b.name)).toEqual(['Santander', 'Banco Estado', 'Banco Falabella', 'Banco de Chile', 'Billetera de Google'])
    expect(BANKS.map((b) => b.id)).toContain('billetera-google')
  })
  it('solo Banco Falabella y Billetera de Google están disponibles para captura', () => {
    expect(CAPTURE_AVAILABLE.map((b) => b.id)).toEqual(['banco-falabella', 'billetera-google'])
    expect(BANKS.filter((b) => !b.available).map((b) => b.id)).toEqual(['santander', 'banco-estado', 'banco-chile'])
  })
  it('el texto sale de la misma lista', () => {
    expect(CAPTURE_AVAILABLE_TEXT).toBe('Por ahora funciona con Banco Falabella y Billetera de Google. Pronto sumaremos más bancos.')
  })
})

describe('parseBankPresets', () => {
  it('sin preferencias solo devuelve las disponibles, apagadas y sin app asociada', () => {
    const r = parseBankPresets(null)
    expect(r.map((b) => b.id)).toEqual(['banco-falabella', 'billetera-google'])
    expect(r.every((b) => b.available && !b.autoSave && b.packageName === null)).toBe(true)
  })
  it('un banco oculto con preferencia guardada encendida se conserva para poder apagarlo', () => {
    const r = parseBankPresets({ banks: [{ id: 'santander', packageName: 'cl.santander.app', autoSave: true }, { id: 'banco-chile', packageName: '../mal', autoSave: 'si' }, { id: 'banco-estado', packageName: 'cl.be.app', autoSave: false }, { id: 'otro', autoSave: true }] })
    expect(r.map((b) => b.id)).toEqual(['santander', 'banco-falabella', 'billetera-google'])
    expect(r[0]).toMatchObject({ available: false, packageName: 'cl.santander.app', autoSave: true })
  })
  it('lee Billetera de Google como una fuente más', () => {
    const r = parseBankPresets({ banks: [{ id: 'billetera-google', packageName: 'com.google.android.apps.walletnfcrel', autoSave: true }] })
    expect(r.find((b) => b.id === 'billetera-google')).toMatchObject({ name: 'Billetera de Google', packageName: 'com.google.android.apps.walletnfcrel', autoSave: true })
  })
  it('sin app asociada no puede quedar encendido', () => {
    expect(parseBankPresets({ banks: [{ id: 'banco-falabella', autoSave: true }] })[0]!.autoSave).toBe(false)
  })
})

describe('bankStatus', () => {
  it('dice si falta asociar la app', () => {
    expect(bankStatus({ id: 'santander', name: 'Santander', available: false, packageName: null, autoSave: false })).toBe('Sin app asociada')
    expect(bankStatus({ id: 'santander', name: 'Santander', available: false, packageName: 'cl.s.app', autoSave: false })).toBe('App asociada: cl.s.app')
  })
})

describe('sincronización', () => {
  it('lee el estado y tolera basura', () => {
    expect(parseSyncState({ state: 'syncing', lastSyncAt: 5, pending: 2 })).toEqual({ state: 'syncing', lastSyncAt: 5, pending: 2 })
    expect(parseSyncState('x')).toEqual({ state: 'idle', lastSyncAt: null, pending: 0 })
    expect(parseSyncState({ state: 'raro', pending: -3 })).toEqual({ state: 'idle', lastSyncAt: null, pending: 0 })
  })
  it('el resumen habla en español simple', () => {
    expect(syncSummary({ state: 'idle', lastSyncAt: null, pending: 0 })).toBe('Todo al día. No hay gastos por enviar.')
    expect(syncSummary({ state: 'idle', lastSyncAt: null, pending: 2 })).toBe('Tienes 2 gastos por enviar.')
    expect(syncSummary({ state: 'syncing', lastSyncAt: null, pending: 1 })).toBe('Enviando 1 gasto…')
    expect(syncSummary({ state: 'error', lastSyncAt: null, pending: 1 })).toMatch(/No pudimos enviar/)
  })
})

describe('parseThreshold (aviso de gastos de mi pareja)', () => {
  it('el valor por defecto es 50.000', () => {
    expect(DEFAULT_PARTNER_THRESHOLD).toBe(50_000)
  })
  it('acepta pesos enteros, con o sin puntos', () => {
    expect(parseThreshold('50.000')).toEqual({ ok: true, value: 50_000 })
    expect(parseThreshold(' 120000 ')).toEqual({ ok: true, value: 120_000 })
  })
  it('rechaza vacío, cero, decimales, letras y montos absurdos con un mensaje', () => {
    for (const t of ['', '0', '12,5', 'abc', '99999999999', '-5']) expect(parseThreshold(t)).toEqual({ ok: false, error: expect.any(String) })
  })
})

describe('syncNeedsSignIn', () => {
  it('true si el último error del envío es de sesión o de perfil', () => {
    expect(syncNeedsSignIn({ lastError: 'OWNER' })).toBe(true)
    expect(syncNeedsSignIn({ lastError: 'NO_PROFILE' })).toBe(true)
  })
  it('false con otros errores, sin error o con basura', () => {
    expect(syncNeedsSignIn({ lastError: 'NETWORK' })).toBe(false)
    expect(syncNeedsSignIn({ lastError: null })).toBe(false)
    expect(syncNeedsSignIn('x')).toBe(false)
  })
})
