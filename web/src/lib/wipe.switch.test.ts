import { beforeEach, describe, expect, it, vi } from 'vitest'

// H-01: al entrar otra persona sin cerrar sesión, lo capturado y la configuración de la anterior se borran,
// pero NO se llama a wipe() porque borraría la sesión nueva.
const { wipe, wipeForAccountSwitch: nativeSwitch, secureRemove } = vi.hoisted(() => ({ wipe: vi.fn(async () => undefined), wipeForAccountSwitch: vi.fn(async () => undefined), secureRemove: vi.fn(async () => undefined) }))
vi.mock('./nativeBridge', () => ({ isNativeApp: () => true, ContigoNative: { wipe, wipeForAccountSwitch: nativeSwitch, secureRemove } }))

import { CAPTURE_CONFIG_KEY, wipeForAccountSwitch } from './wipe'

describe('wipeForAccountSwitch', () => {
  beforeEach(() => vi.clearAllMocks())
  it('borra colas y borradores ajenos y la configuración, y no toca la sesión nueva', () => {
    wipeForAccountSwitch()
    expect(nativeSwitch).toHaveBeenCalledWith({ ownerKey: null })
    expect(secureRemove).toHaveBeenCalledWith({ key: CAPTURE_CONFIG_KEY })
    expect(wipe).not.toHaveBeenCalled()
  })
})
