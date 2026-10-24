import { useCallback, useEffect, useState } from 'react'
import { getLockMinutes, isFlaggedLocked, lastActive, setFlaggedLocked, shouldLock, touch } from './applock'

/** Vigila la inactividad y dice si la app debe estar bloqueada. El estado sobrevive a recargar la página. */
export function useAppLock(): { locked: boolean; unlock: () => void } {
  const [locked, setLocked] = useState(() => {
    const min = getLockMinutes()
    return min > 0 && (isFlaggedLocked() || shouldLock(min, lastActive()))
  })

  const lock = useCallback(() => {
    setFlaggedLocked(true)
    setLocked(true)
  }, [])

  useEffect(() => {
    if (locked) {
      setFlaggedLocked(true)
      return
    }
    let last = 0
    const activity = () => {
      const now = Date.now()
      if (now - last > 5000) {
        last = now
        touch(now)
      }
    }
    const check = () => {
      const min = getLockMinutes()
      if (shouldLock(min, lastActive())) lock()
    }
    const onVisible = () => (document.visibilityState === 'visible' ? check() : touch())
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(check, 15_000)
    touch()
    return () => {
      events.forEach((e) => window.removeEventListener(e, activity))
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [locked, lock])

  const unlock = useCallback(() => {
    setFlaggedLocked(false)
    touch()
    setLocked(false)
  }, [])

  return { locked, unlock }
}
