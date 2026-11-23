import { describe, expect, it } from 'vitest'
import { BANKS, DEFAULT_PARTNER_THRESHOLD, bankStatus, parseBankPresets, parseSyncState, parseThreshold, syncSummary } from './bankAuto'

describe('BANKS', () => {
  it('son los cuatro bancos y Billetera Google, en este orden', () => {
    expect(BANKS.map((b) => b.name)).toEqual(['Santander', 'Banco Estado', 'Banco Falabella', 'Banco de Chile', 'Billetera Google'])
    expect(BANKS.map((b) => b.id)).toContain('billetera-google')
  })
})

describe('parseBankPresets', () => {
  it('siempre devuelve todas las fuentes, apagadas y sin app asociada si el teléfono no dice nada', () => {
    const r = parseBankPresets(null)
    expect(r).toHaveLength(5)
    expect(r.every((b) => !b.autoSave && b.packageName === null)).toBe(true)
  })
  it('lee el estado de cada banco y descarta lo inválido', () => {
    const r = parseBankPresets({ banks: [{ id: 'santander', packageName: 'cl.santander.app', autoSave: true }, { id: 'banco-chile', packageName: '../mal', autoSave: 'si' }, { id: 'otro', autoSave: true }] })
    expect(r.find((b) => b.id === 'santander')).toMatchObject({ packageName: 'cl.santander.app', autoSave: true })
    expect(r.find((b) => b.id === 'banco-chile')).toMatchObject({ packageName: null, autoSave: false })
    expect(r).toHaveLength(5)
  })
  it('lee Billetera Google como una fuente más', () => {
    const r = parseBankPresets({ banks: [{ id: 'billetera-google', packageName: 'com.google.android.apps.walletnfcrel', autoSave: true }] })
    expect(r.find((b) => b.id === 'billetera-google')).toMatchObject({ name: 'Billetera Google', packageName: 'com.google.android.apps.walletnfcrel', autoSave: true })
  })
  it('sin app asociada no puede quedar encendido', () => {
    expect(parseBankPresets({ banks: [{ id: 'santander', autoSave: true }] })[0]!.autoSave).toBe(false)
  })
})

describe('bankStatus', () => {
  it('dice si falta asociar la app', () => {
    expect(bankStatus({ id: 'santander', name: 'Santander', packageName: null, autoSave: false })).toBe('Sin app asociada')
    expect(bankStatus({ id: 'santander', name: 'Santander', packageName: 'cl.s.app', autoSave: false })).toBe('App asociada: cl.s.app')
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
