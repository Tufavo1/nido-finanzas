// Copyright (c) 2026 Dinovance
import { useEffect, useState } from 'react'

const ARMED_MS = 4000

/** «Borrar todos» en dos toques: el primero pide confirmar y se desarma solo a los 4 s */
export default function ClearAllNotices({ onClear }: { onClear: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), ARMED_MS)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={armed ? 'btn danger small' : 'btn ghost small'}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        onClear()
      }}
    >
      {armed ? 'Toca otra vez para borrar todos' : 'Borrar todos'}
    </button>
  )
}
