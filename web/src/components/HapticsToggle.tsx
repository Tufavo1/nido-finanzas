// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import { haptic, hapticsEnabled, setHapticsEnabled } from '../lib/haptics'

/** Apagar o encender la vibración al guardar (RF-13). Además respeta la configuración del teléfono. */
export default function HapticsToggle() {
  const [on, setOn] = useState(hapticsEnabled)
  return (
    <section className="card">
      <div className="row between">
        <div className="stack tight">
          <strong id="haptics-label">Vibración al guardar</strong>
          <span className="muted small-text">Una vibración suave al guardar un gasto o si algo falla.</span>
        </div>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={on}
          aria-labelledby="haptics-label"
          onClick={() => {
            setHapticsEnabled(!on)
            setOn(!on)
            if (!on) haptic('tap')
          }}
        />
      </div>
    </section>
  )
}
