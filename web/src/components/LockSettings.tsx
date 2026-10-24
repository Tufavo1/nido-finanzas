import { useState } from 'react'
import { LOCK_OPTIONS, getLockMinutes, setLockMinutes } from '../lib/applock'
import type { Notify } from './Toast'

export default function LockSettings({ onToast }: { onToast: Notify }) {
  const [min, setMin] = useState(getLockMinutes)

  function choose(m: number) {
    setLockMinutes(m)
    setMin(m)
    onToast(
      m === 0 ? 'Bloqueo desactivado\nLa app ya **no se bloqueará** sola.' : `Bloqueo activado\nLa app se bloqueará tras **${m} ${m === 1 ? 'minuto' : 'minutos'}** sin usarla.`,
      m === 0 ? 'warn' : 'success',
    )
  }

  return (
    <section className="card">
      <strong>Bloquear la app tras un rato sin usarla</strong>
      <span className="muted">
        Si dejas la app abierta o la minimizas, se tapa sola y pide tu contraseña para seguir. Ideal si prestas el teléfono o lo pierdes de vista.
      </span>
      <div className="seg" role="group" aria-label="Tiempo para bloquear">
        {LOCK_OPTIONS.map((o) => (
          <button key={o.minutes} type="button" aria-pressed={min === o.minutes} onClick={() => choose(o.minutes)}>
            {o.label}
          </button>
        ))}
      </div>
      <span className="hint">
        Es una barrera de privacidad en este dispositivo. No reemplaza el bloqueo de pantalla de tu teléfono.
      </span>
    </section>
  )
}
