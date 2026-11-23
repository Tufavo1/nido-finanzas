import { describe, expect, it } from 'vitest'
import { emptyState, errorScreen, notificationPermissionState } from './screenState'
import type { AppErrorKind } from './appError'

// Estados de error y vacío como lógica pura (qué pantalla corresponde a cada error).
describe('errorScreen: error → pantalla', () => {
  const tabla: [AppErrorKind, string, string][] = [
    ['OFFLINE', 'offline', 'retry'],
    ['TIMEOUT', 'offline', 'retry'],
    ['SESSION_EXPIRED', 'session-expired', 'login'],
    ['UNAUTHORIZED', 'session-expired', 'login'],
    ['FORBIDDEN', 'no-permission', 'home'],
    ['NOT_FOUND', 'not-found', 'home'],
    ['MAINTENANCE', 'maintenance', 'retry'],
    ['SERVER', 'unexpected', 'retry'],
    ['UNKNOWN', 'unexpected', 'retry'],
  ]
  it.each(tabla)('%s → %s con acción %s', (kind, screen, action) => {
    const s = errorScreen({ kind })
    expect(s.screen).toBe(screen)
    expect(s.primary.kind).toBe(action)
    expect(s.title.length).toBeGreaterThan(3)
    expect(s.detail.length).toBeGreaterThan(10)
    expect(s.primary.label.length).toBeGreaterThan(2)
  })

  it('los textos están en español simple y sin jerga técnica', () => {
    const kinds: AppErrorKind[] = ['OFFLINE', 'TIMEOUT', 'SESSION_EXPIRED', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'MAINTENANCE', 'SERVER', 'UNKNOWN']
    for (const kind of kinds) {
      const s = errorScreen({ kind })
      expect(`${s.title} ${s.detail}`).not.toMatch(/exception|stack|null|undefined|HTTP|JWT|RLS|SQL|\b50\d\b|\b40\d\b/i)
    }
  })

  it('conflicto, validación y límite de peticiones no son pantallas de error: se informan con un aviso (toast)', () => {
    for (const kind of ['CONFLICT', 'VALIDATION', 'RATE_LIMIT'] as const) expect(errorScreen({ kind }).screen).toBe('unexpected')
  })
})

describe('emptyState: estados vacíos con guía de primer paso', () => {
  it('lista vacía devuelve título, guía y un llamado a la acción', () => {
    for (const section of ['expenses', 'goals', 'recurring', 'drafts'] as const) {
      const e = emptyState(section, 0)
      expect(e, section).not.toBeNull()
      expect(e!.title.length).toBeGreaterThan(3)
      expect(e!.hint.length).toBeGreaterThan(10)
      expect(e!.cta.label.length).toBeGreaterThan(2)
    }
  })

  it('el vacío de gastos lleva a Registrar y el de metas a Metas', () => {
    expect(emptyState('expenses', 0)!.cta.target).toBe('register')
    expect(emptyState('goals', 0)!.cta.target).toBe('goals')
  })

  it('con elementos no hay estado vacío', () => {
    expect(emptyState('expenses', 1)).toBeNull()
    expect(emptyState('goals', 25)).toBeNull()
  })
})

describe('notificationPermissionState: permiso de notificaciones pendiente o revocado', () => {
  it('nunca se pidió: pendiente', () => {
    expect(notificationPermissionState('default', false)?.screen).toBe('permission-pending')
  })
  it('estaba concedido y ahora está denegado: revocado', () => {
    expect(notificationPermissionState('denied', true)?.screen).toBe('permission-revoked')
  })
  it('denegado desde el comienzo: pendiente de que la persona lo active', () => {
    expect(notificationPermissionState('denied', false)?.screen).toBe('permission-pending')
  })
  it('concedido: no hay pantalla', () => {
    expect(notificationPermissionState('granted', true)).toBeNull()
  })
})
