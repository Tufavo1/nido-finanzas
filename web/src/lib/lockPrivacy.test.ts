import { describe, expect, it } from 'vitest'
import { captureNotificationText, DEFAULT_HIDE_ON_LOCK_SCREEN } from './lockPrivacy'

// Decisión 5 (decisiones.md) y CA-06-1 / CA-06-5: la notificación de captura oculta el monto por defecto.
const C = { amountClp: 12_990, merchant: 'Almacen Demo Spa' }

describe('captureNotificationText', () => {
  it('ocultar montos en la pantalla de bloqueo está activado por defecto', () => {
    expect(DEFAULT_HIDE_ON_LOCK_SCREEN).toBe(true)
  })

  it('sin indicar nada, el texto no contiene el monto', () => {
    const t = captureNotificationText(C)
    expect(t.title).toBe('Gasto detectado')
    expect(t.body).not.toMatch(/\d/)
    expect(t.body).not.toContain('$')
    expect(t.body.length).toBeGreaterThan(0)
  })

  it('oculto: ni con otros montos ni formatos aparece cifra alguna', () => {
    for (const amountClp of [1, 999, 50_000, 1_250_000, 9_999_999_999]) {
      const t = captureNotificationText({ amountClp, merchant: null }, true)
      expect(`${t.title} ${t.body}`).not.toMatch(/\d/)
    }
  })

  it('CA-06-1: visible, el cuerpo trae monto y comercio', () => {
    const t = captureNotificationText(C, false)
    expect(t.title).toBe('Gasto detectado')
    expect(t.body).toMatch(/12\.990/)
    expect(t.body).toContain('Almacen Demo Spa')
  })

  it('visible y sin comercio: solo el monto', () => {
    const t = captureNotificationText({ amountClp: 4_000, merchant: null }, false)
    expect(t.body).toMatch(/4\.000/)
    expect(t.body).not.toMatch(/null|undefined/)
  })

  it('el texto oculto es el mismo para cualquier monto (no filtra información)', () => {
    expect(captureNotificationText({ amountClp: 1, merchant: null }, true)).toEqual(captureNotificationText({ amountClp: 900_000, merchant: null }, true))
  })
})
