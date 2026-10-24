import { useState } from 'react'
import { applyUpdate, useUpdateWaiting } from '../lib/update'

/** Avisa que hay una versión nueva; se instala solo cuando la persona lo decide */
export default function UpdateBanner() {
  const waiting = useUpdateWaiting()
  const [hidden, setHidden] = useState(false)
  if (!waiting || hidden) return null

  return (
    <div className="install-banner" role="region" aria-label="Actualización disponible">
      <div className="grow">
        <strong>Hay una versión nueva de Contigo</strong>
        <span className="muted small-text install-text">Guarda lo que estés escribiendo y actualiza cuando quieras.</span>
      </div>
      <div className="row">
        <button type="button" className="btn small" onClick={() => void applyUpdate()}>
          Actualizar
        </button>
        <button type="button" className="btn ghost small" onClick={() => setHidden(true)}>
          Después
        </button>
      </div>
    </div>
  )
}
