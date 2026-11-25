// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { consentNext, DIAGNOSTIC_REASONS, diagnosticText, foundLine, parseDetectedBanks, parseDiagnostics, shouldAskConsent, activatedMessage, summarizeCapture } from './bankConsent'

describe('flujo del consentimiento (máquina de estados)', () => {
  it('Aceptar sin permiso va al permiso; con permiso va directo a detectar', () => {
    expect(consentNext('ask', { type: 'accept', permission: false })).toBe('permission')
    expect(consentNext('ask', { type: 'accept', permission: true })).toBe('detecting')
  })
  it('Ahora no cierra', () => expect(consentNext('ask', { type: 'decline' })).toBe('closed'))
  it('en el permiso: sigue ahí hasta que el estado confirme el acceso', () => {
    expect(consentNext('permission', { type: 'checked', permission: false })).toBe('permission')
    expect(consentNext('permission', { type: 'checked', permission: true })).toBe('detecting')
  })
  it('detectar: con bancos resultado, sin bancos vacío, con fallo error', () => {
    expect(consentNext('detecting', { type: 'detected', count: 2 })).toBe('result')
    expect(consentNext('detecting', { type: 'detected', count: 0 })).toBe('none')
    expect(consentNext('detecting', { type: 'failed' })).toBe('error')
  })
  it('si el permiso se revoca durante la detección vuelve al permiso', () => {
    expect(consentNext('detecting', { type: 'checked', permission: false })).toBe('permission')
  })
  it('error reintenta; listo y cerrar terminan; eventos que no aplican no mueven', () => {
    expect(consentNext('error', { type: 'retry' })).toBe('detecting')
    expect(consentNext('result', { type: 'done' })).toBe('closed')
    expect(consentNext('none', { type: 'done' })).toBe('closed')
    expect(consentNext('ask', { type: 'done' })).toBe('ask')
    expect(consentNext('closed', { type: 'accept', permission: false })).toBe('closed')
  })
})

describe('shouldAskConsent: solo la primera vez y sin insistir', () => {
  it('primera vez sí; aceptado o rechazado no', () => {
    expect(shouldAskConsent(null)).toBe(true)
    expect(shouldAskConsent('accepted')).toBe(false)
    expect(shouldAskConsent('declined')).toBe(false)
    expect(shouldAskConsent('basura')).toBe(false)
  })
})

describe('bancos detectados', () => {
  it('solo fuentes disponibles con paquete válido, sin repetir', () => {
    const r = parseDetectedBanks({ banks: [{ id: 'banco-falabella', packageName: 'cl.bf.app' }, { id: 'banco-falabella', packageName: 'cl.bf.app' }, { id: 'raro', packageName: 'x.y' }, { id: 'billetera-google', packageName: 'no valido!' }, { id: 'billetera-google', packageName: 'com.google.android.apps.walletnfcrel' }] })
    expect(r.map((b) => b.id)).toEqual(['banco-falabella', 'billetera-google'])
    expect(r[0]).toEqual({ id: 'banco-falabella', name: 'Banco Falabella', packageName: 'cl.bf.app' })
  })
  it('un banco detectado pero oculto no se ofrece', () => {
    const r = parseDetectedBanks({ banks: [{ id: 'santander', packageName: 'cl.santander.app' }, { id: 'banco-estado', packageName: 'cl.be.app' }, { id: 'banco-chile', packageName: 'cl.bancochile.mobile' }] })
    expect(r).toEqual([])
  })
  it('basura da lista vacía', () => {
    expect(parseDetectedBanks(null)).toEqual([])
    expect(parseDetectedBanks({ banks: 'x' })).toEqual([])
  })
  it('textos cortos', () => {
    const two = [{ id: 'santander', name: 'Santander', packageName: 'a.b' }, { id: 'banco-chile', name: 'Banco de Chile', packageName: 'c.d' }]
    expect(foundLine(two)).toBe('Encontramos: Santander, Banco de Chile')
    expect(foundLine([])).toBe('No encontramos apps de bancos en este teléfono.')
    expect(activatedMessage([two[0]!])).toBe('Listo: Santander activado')
    expect(activatedMessage(two)).toBe('Listo: Santander y Banco de Chile activados')
  })
})

describe('summarizeCapture: una línea de estado', () => {
  it('sin permiso gana a todo', () => expect(summarizeCapture({ listenerAllowed: false, enabled: true, revoked: false })).toEqual({ kind: 'no-permission', label: 'Sin permiso' }))
  it('permiso revocado se explica', () => expect(summarizeCapture({ listenerAllowed: false, enabled: true, revoked: true }).label).toBe('Sin permiso'))
  it('pausado y activo', () => {
    expect(summarizeCapture({ listenerAllowed: true, enabled: false, revoked: false })).toEqual({ kind: 'paused', label: 'Pausado' })
    expect(summarizeCapture({ listenerAllowed: true, enabled: true, revoked: false })).toEqual({ kind: 'active', label: 'Activo' })
  })
})

describe('diagnóstico: motivo → texto simple', () => {
  it('mapea los motivos conocidos y uno genérico para el resto', () => {
    expect(diagnosticText('NO_AMOUNT')).toBe('No encontré un monto')
    expect(diagnosticText('INCOME')).toBe('Parece un abono')
    expect(diagnosticText('BANK_OFF')).toBe('Banco apagado')
    expect(diagnosticText('LOGIN_REQUIRED')).toBe('Falta iniciar sesión')
    expect(diagnosticText('ALGO_NUEVO')).toBe('No pude leerlo')
    expect(diagnosticText(undefined)).toBe('No pude leerlo')
  })
  it('parseDiagnostics: solo lo necesario, texto enmascarado, tope de 20', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ reason: 'NO_AMOUNT', maskedText: `Compra **** ${i}`, at: 1000 + i }))
    const r = parseDiagnostics({ items: [...items, { reason: 'INCOME' }, 7] })
    expect(r).toHaveLength(20)
    expect(r[0]).toEqual({ reason: 'No encontré un monto', masked: 'Compra **** 0', at: 1000 })
  })
  it('sin texto enmascarado no hay nada que copiar', () => {
    expect(parseDiagnostics({ items: [{ reason: 'INCOME', at: 5 }] })[0]?.masked).toBeNull()
    expect(parseDiagnostics(undefined)).toEqual([])
  })
})

describe('motivos de cuotas', () => {
  it('tienen título y explicación propios', () => {
    expect(DIAGNOSTIC_REASONS['INSTALLMENT_PURCHASE']).toEqual({ title: 'Compra en cuotas', detail: 'La anoté por el total. Confírmala.' })
    expect(DIAGNOSTIC_REASONS['INSTALLMENT_TOTAL_UNKNOWN']).toEqual({ title: 'Falta el total', detail: 'El aviso solo trae el valor de la cuota. Pon el total de la compra.' })
    expect(DIAGNOSTIC_REASONS['SOURCE_UNAVAILABLE']).toEqual({ title: 'Banco no disponible por ahora', detail: 'Por ahora solo leemos avisos de Banco Falabella y Billetera de Google. Puedes apagar este banco en Gastos automáticos.' })
    expect(DIAGNOSTIC_REASONS['INSTALLMENT_CHARGE']).toEqual({ title: 'Cuota de una compra anterior', detail: 'Es el cobro de una cuota de algo que ya anotaste, no un gasto nuevo.' })
  })
})
