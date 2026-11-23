// Copyright (c) 2026 Dinovance
import { beforeEach, describe, expect, it, vi } from 'vitest'

// H-01 (h, d): cerrar sesión debe vaciar borradores, notificaciones, almacén seguro y cola del TELÉFONO, no solo localStorage.
const { wipe } = vi.hoisted(() => ({ wipe: vi.fn(async () => undefined) }))
vi.mock('./nativeBridge', () => ({ isNativeApp: () => true, ContigoNative: { wipe } }))

import { wipeSessionData } from './wipe'

describe('wipeSessionData dentro de la app nativa', () => {
  beforeEach(() => wipe.mockClear())

  it('llama a ContigoNative.wipe() (sesión, cola cifrada, borradores y notificaciones propias)', () => {
    wipeSessionData()
    expect(wipe).toHaveBeenCalledTimes(1)
  })

  it('aunque localStorage no exista, igual vacía lo nativo', () => {
    // En Node no hay localStorage: la rama web falla en silencio y no debe impedir el borrado nativo
    expect(() => wipeSessionData()).not.toThrow()
    expect(wipe).toHaveBeenCalled()
  })
})
