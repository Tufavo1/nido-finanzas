// Copyright (c) 2026 Dinovance
import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { isNative } from './platform'
import { backAction } from './backNav'
import { closeTopOverlay, hasOverlay } from './overlays'
import { isDirty } from './dirtyForms'

/** Botón atrás de Android: cierra la ventana abierta, pide confirmar si hay cambios sin guardar, vuelve de pestaña o minimiza desde Inicio. En la web no hace nada. */
export function useBackButton(tab: string, goTo: (tab: string) => void, confirmDiscard: (tab: string) => void): void {
  const current = useRef({ tab, goTo, confirmDiscard })
  useEffect(() => {
    current.current = { tab, goTo, confirmDiscard }
  })
  useEffect(() => {
    if (!isNative()) return
    const handle = App.addListener('backButton', () => {
      const a = backAction({ overlayOpen: hasOverlay(), tab: current.current.tab, dirty: isDirty() })
      if (a.kind === 'close-overlay') closeTopOverlay()
      else if (a.kind === 'confirm-discard') current.current.confirmDiscard(a.tab)
      else if (a.kind === 'go') current.current.goTo(a.tab)
      else void App.minimizeApp()
    })
    return () => {
      void handle.then((h) => h.remove())
    }
  }, [])
}
