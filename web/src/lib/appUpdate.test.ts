// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { CHECK_EVERY_MS, formatBytes, nativeCopy, parseAppInfo, parseUpdateInfo, parsePushStatus, progressPercent, shouldCheck, shouldPrompt, updateErrorInfo } from './appUpdate'

const H = 3_600_000

describe('shouldCheck: máximo una vez cada 6 h', () => {
  it('nunca revisó o el dato es raro: revisa', () => {
    expect(shouldCheck(null, 1000)).toBe(true)
    expect(shouldCheck(Number.NaN, 1000)).toBe(true)
  })
  it('antes de 6 h no, desde 6 h sí', () => {
    expect(CHECK_EVERY_MS).toBe(6 * H)
    expect(shouldCheck(0, 6 * H - 1)).toBe(false)
    expect(shouldCheck(0, 6 * H)).toBe(true)
  })
  it('reloj atrasado (última revisión en el futuro): revisa', () => {
    expect(shouldCheck(10 * H, 0)).toBe(true)
  })
})

describe('shouldPrompt: «Más tarde» se recuerda por versión', () => {
  const info = { available: true, versionName: '1.2.0' } as const
  it('no hay nada nuevo: no molesta', () => expect(shouldPrompt({ available: false }, null)).toBe(false))
  it('versión nueva sin descartar: avisa', () => expect(shouldPrompt(info, null)).toBe(true))
  it('descartó esa versión: no molesta; con otra versión más nueva sí', () => {
    expect(shouldPrompt(info, '1.2.0')).toBe(false)
    expect(shouldPrompt({ available: true, versionName: '1.3.0' }, '1.2.0')).toBe(true)
  })
  it('el botón manual ignora lo descartado', () => expect(shouldPrompt(info, '1.2.0', true)).toBe(true))
})

describe('parsers del contrato nativo (datos inciertos)', () => {
  it('parseUpdateInfo', () => {
    expect(parseUpdateInfo({ available: true, versionName: '1.2.0', notes: 'Mejoras', sizeBytes: 5_000_000 })).toEqual({ available: true, versionName: '1.2.0', notes: 'Mejoras', sizeBytes: 5_000_000 })
    expect(parseUpdateInfo({ available: true })).toEqual({ available: false })
    expect(parseUpdateInfo(null)).toEqual({ available: false })
    expect(parseUpdateInfo({ available: false, versionName: '9' })).toEqual({ available: false })
    expect(parseUpdateInfo({ available: true, versionName: '1.2.0', sizeBytes: -4, notes: 7 })).toEqual({ available: true, versionName: '1.2.0' })
  })
  it('parseAppInfo', () => {
    expect(parseAppInfo({ versionName: '1.0.3', versionCode: 12 })).toEqual({ versionName: '1.0.3', versionCode: 12 })
    expect(parseAppInfo({ versionName: '1.0.3', versionCode: '12' })).toEqual({ versionName: '1.0.3', versionCode: 12 })
    expect(parseAppInfo({})).toBeNull()
  })
  it('parsePushStatus', () => {
    expect(parsePushStatus({ permission: 'granted', tokenRegistered: true })).toEqual({ permission: 'granted', tokenRegistered: true })
    expect(parsePushStatus({ permission: 'raro' })).toEqual({ permission: 'default', tokenRegistered: false })
    expect(parsePushStatus(undefined)).toEqual({ permission: 'default', tokenRegistered: false })
  })
})

describe('progreso y tamaño', () => {
  it('progressPercent acotado 0..100 y sin total conocido es null', () => {
    expect(progressPercent(50, 200)).toBe(25)
    expect(progressPercent(300, 200)).toBe(100)
    expect(progressPercent(-1, 200)).toBe(0)
    expect(progressPercent(10, 0)).toBeNull()
    expect(progressPercent(10, undefined)).toBeNull()
  })
  it('formatBytes en español simple', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2_500_000)).toBe('2,5 MB')
    expect(formatBytes(undefined)).toBe('')
  })
})

describe('updateErrorInfo: español simple, sin códigos ni mensajes crudos', () => {
  it('falta permiso para instalar apps lleva a Ajustes', () => {
    const e = updateErrorInfo({ code: 'NEEDS_INSTALL_PERMISSION' })
    expect(e.kind).toBe('permission')
    expect(e.text).toMatch(/permiso/i)
  })
  it('sin red, sin espacio, descarga dañada y desconocido: reintentar', () => {
    for (const code of ['NETWORK', 'NO_SPACE', 'CORRUPT', 'FAILED', undefined, 'XYZ']) {
      const e = updateErrorInfo({ code })
      expect(e.kind).toBe('retry')
      expect(e.text).not.toMatch(/NETWORK|NO_SPACE|CORRUPT|FAILED|XYZ|Error|exception/i)
    }
    expect(updateErrorInfo({ code: 'NETWORK' }).text).toMatch(/conexión/i)
    expect(updateErrorInfo({ code: 'NO_SPACE' }).text).toMatch(/espacio/i)
  })
  it('códigos reales de Android: el permiso de instalar lleva a Ajustes', () => {
    const e = updateErrorInfo({ code: 'INSTALL_NOT_ALLOWED' })
    expect(e.kind).toBe('permission')
    expect(e.text).toMatch(/permiso/i)
  })
  it('códigos reales de Android: cada fallo dice algo distinto y útil', () => {
    const t = (code: string) => updateErrorInfo({ code }).text
    expect(t('NO_NETWORK')).toMatch(/conexión/i)
    expect(t('RATE_LIMITED')).toMatch(/demasiad|más tarde|momento/i)
    expect(t('HASH_MISMATCH')).toMatch(/dañada|incompleta/i)
    expect(t('INVALID_FORMAT')).toMatch(/dañada|incompleta|no se pudo leer/i)
    expect(t('NO_ASSET')).toMatch(/todavía|no está lista|incompleta/i)
    expect(t('WRONG_SIGNATURE')).toMatch(/firma|desinstal/i)
    expect(t('WRONG_PACKAGE')).toMatch(/no es de Contigo|no corresponde/i)
    expect(t('DOWNGRADE')).toMatch(/ya tienes/i)
    expect(t('INSTALL_FAILED')).toMatch(/Android|instalador|rechaz/i)
    expect(new Set(['NO_NETWORK', 'HASH_MISMATCH', 'WRONG_SIGNATURE', 'DOWNGRADE', 'INSTALL_FAILED'].map(t)).size).toBe(5)
  })
  it('un error no objeto no revienta', () => expect(updateErrorInfo('boom').kind).toBe('retry'))
})

describe('nativeCopy: en nativo nada de PWA, instalar ni navegador', () => {
  it('textos nativos sin palabras de la web', () => {
    const t = Object.values(nativeCopy).join(' ')
    expect(t).not.toMatch(/pwa|navegador|service worker|pantalla de inicio|vapid|web push/i)
    expect(nativeCopy.appKind).toBe('Aplicación Android')
  })
})
