import { describe, expect, it } from 'vitest'
import { backAction } from './backNav'
import { isDirty, markDirty } from './dirtyForms'
import { closeTopOverlay, hasOverlay, registerOverlay } from './overlays'

describe('backAction (RF-11)', () => {
  it('CA-11-1: con una ventana abierta, atrás la cierra y no cambia la pestaña', () => {
    expect(backAction({ overlayOpen: true, tab: 'expenses' })).toEqual({ kind: 'close-overlay' })
  })
  it('CA-11-2: desde Gastos vuelve a Inicio', () => {
    expect(backAction({ overlayOpen: false, tab: 'expenses' })).toEqual({ kind: 'go', tab: 'home' })
  })
  it('CA-11-3: desde Inicio la app se minimiza', () => {
    expect(backAction({ overlayOpen: false, tab: 'home' })).toEqual({ kind: 'minimize' })
  })
  it('Ayuda y Perfil vuelven a Ajustes; Ajustes vuelve a Inicio', () => {
    expect(backAction({ overlayOpen: false, tab: 'help' })).toEqual({ kind: 'go', tab: 'security' })
    expect(backAction({ overlayOpen: false, tab: 'profile' })).toEqual({ kind: 'go', tab: 'security' })
    expect(backAction({ overlayOpen: false, tab: 'security' })).toEqual({ kind: 'go', tab: 'home' })
  })
})

describe('backAction con cambios sin guardar (RF-11)', () => {
  it('si hay cambios sin guardar y se va a salir, pide confirmar antes', () => {
    expect(backAction({ overlayOpen: false, tab: 'add', dirty: true })).toEqual({ kind: 'confirm-discard', tab: 'home' })
  })
  it('sin cambios sale directo; una ventana abierta se cierra primero aunque haya cambios', () => {
    expect(backAction({ overlayOpen: false, tab: 'add', dirty: false })).toEqual({ kind: 'go', tab: 'home' })
    expect(backAction({ overlayOpen: true, tab: 'add', dirty: true })).toEqual({ kind: 'close-overlay' })
  })
})

describe('dirtyForms', () => {
  it('es verdadero mientras algún formulario tenga cambios', () => {
    expect(isDirty()).toBe(false)
    const a = markDirty('a')
    const b = markDirty('b')
    expect(isDirty()).toBe(true)
    a()
    expect(isDirty()).toBe(true)
    b()
    expect(isDirty()).toBe(false)
  })
})

describe('overlays', () => {
  it('cierra primero la ventana de más arriba y deja de contar las que se cerraron', () => {
    const closed: string[] = []
    const offA = registerOverlay(() => closed.push('a'))
    const offB = registerOverlay(() => closed.push('b'))
    expect(hasOverlay()).toBe(true)
    expect(closeTopOverlay()).toBe(true)
    expect(closed).toEqual(['b'])
    offB()
    offA()
    expect(hasOverlay()).toBe(false)
    expect(closeTopOverlay()).toBe(false)
  })
})
