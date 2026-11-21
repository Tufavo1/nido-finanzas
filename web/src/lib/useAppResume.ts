// Copyright (c) 2026 Dinovance
import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { isNative } from './platform'

/** Avisa cada vez que la app vuelve a primer plano (en la web: cuando la pestaña vuelve a verse). */
export function useAppResume(onResume: () => void): void {
  const cb = useRef(onResume)
  useEffect(() => {
    cb.current = onResume
  })
  useEffect(() => {
    if (!isNative()) {
      const visible = () => document.visibilityState === 'visible' && cb.current()
      document.addEventListener('visibilitychange', visible)
      return () => document.removeEventListener('visibilitychange', visible)
    }
    const handle = App.addListener('appStateChange', (s) => s.isActive && cb.current())
    return () => void handle.then((h) => h.remove())
  }, [])
}
