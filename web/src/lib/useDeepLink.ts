// Copyright (c) 2026 Dinovance
import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { isNative } from './platform'
import { createLinkGuard } from './linkGuard'

/**
 * Enlaces nido://gasto por UNA sola vía: el evento appUrlOpen de @capacitor/app (también entrega el enlace con que
 * se abrió la app). La guarda evita abrir dos borradores si el sistema lo repite. En la web no hace nada.
 */
export function useDeepLink(onLink: (url: string) => void): void {
  const cb = useRef(onLink)
  useEffect(() => {
    cb.current = onLink
  })
  useEffect(() => {
    if (!isNative()) return
    const guard = createLinkGuard()
    const handle = App.addListener('appUrlOpen', (e) => {
      if (guard.accept(e.url, Date.now())) cb.current(e.url)
    })
    return () => void handle.then((h) => h.remove())
  }, [])
}
