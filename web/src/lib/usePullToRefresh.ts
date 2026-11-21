// Copyright (c) 2026 Dinovance
import { useEffect, useRef, useState } from 'react'
import { pullView } from './pull'
import type { PullView } from './pull'

const IDLE: PullView = { distance: 0, ready: false }

/** Actualizar al deslizar hacia abajo desde el borde superior de la pantalla. Solo con el dedo, así que en escritorio no actúa. */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, enabled: boolean): { view: PullView; refreshing: boolean } {
  const [view, setView] = useState(IDLE)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = useRef(onRefresh)
  const latest = useRef(IDLE)
  useEffect(() => {
    refresh.current = onRefresh
  })

  useEffect(() => {
    if (!enabled) return
    let startY: number | null = null
    const show = (v: PullView) => {
      latest.current = v
      setView(v)
    }
    const onStart = (e: TouchEvent) => {
      const screen = e.target instanceof Element ? e.target.closest('main.screen') : null
      const atTop = screen instanceof HTMLElement && screen.scrollTop === 0
      // Con una ventana abierta el gesto es de la ventana, no de la pantalla de atrás
      startY = atTop && !document.querySelector('.sheet-back') ? (e.touches[0]?.clientY ?? null) : null
    }
    const onMove = (e: TouchEvent) => {
      if (startY === null) return
      const y = e.touches[0]?.clientY ?? startY
      show(pullView(y - startY))
    }
    const onEnd = () => {
      const wasReady = latest.current.ready
      startY = null
      show(IDLE)
      if (!wasReady) return
      setRefreshing(true)
      void Promise.resolve(refresh.current()).finally(() => setRefreshing(false))
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])

  return { view, refreshing }
}
