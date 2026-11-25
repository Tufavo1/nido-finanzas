// Copyright (c) 2026 Dinovance
import { useCallback } from 'react'
import type { Notify } from '../components/Toast'
import { clearNoticesToast, clearUnreadNotices } from './nativeSettings'
import type { ClearNoticesApi } from './nativeSettings'

/** «Borrar» (una entrada, con su hora) o «Borrar todos» (sin hora): avisa si no se pudo y vuelve a leer la lista si salió bien */
export function useClearNotices(api: ClearNoticesApi, onToast: Notify, reload: () => void): (atMillis?: number) => Promise<void> {
  return useCallback(
    async (atMillis) => {
      const r = await clearUnreadNotices(api, atMillis)
      const msg = clearNoticesToast(r)
      if (msg) onToast(msg, 'error')
      else reload()
    },
    [api, onToast, reload],
  )
}
