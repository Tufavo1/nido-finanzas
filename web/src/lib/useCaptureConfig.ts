// Copyright (c) 2026 Dinovance
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_CAPTURE_CONFIG, parseCaptureConfig, serializeCaptureConfig } from './captureConfig'
import type { CaptureConfig } from './captureConfig'
import { CAPTURE_CONFIG_KEY } from './wipe'
import { ContigoNative, isNativeApp } from './nativeBridge'
import { logError } from './safeLog'

const KEY = CAPTURE_CONFIG_KEY

/** Preferencias de captura, guardadas en el almacén seguro del teléfono. En la web quedan los valores por defecto. */
export function useCaptureConfig(): { config: CaptureConfig; save: (next: CaptureConfig) => Promise<void> } {
  const [config, setConfig] = useState(DEFAULT_CAPTURE_CONFIG)

  useEffect(() => {
    if (!isNativeApp()) return
    ContigoNative.secureGet({ key: KEY })
      .then((r) => setConfig(parseCaptureConfig(r.value)))
      .catch((e: unknown) => logError(e, 'useCaptureConfig'))
  }, [])

  const save = useCallback(async (next: CaptureConfig) => {
    await ContigoNative.secureSet({ key: KEY, value: serializeCaptureConfig(next) })
    setConfig(next)
  }, [])
  return { config, save }
}
