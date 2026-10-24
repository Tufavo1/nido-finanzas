import { useState } from 'react'
import { setSmartNotify, smartNotifyEnabled } from '../lib/smartNotify'

export default function SmartAlertsSetting() {
  const [on, setOn] = useState(smartNotifyEnabled)
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  return (
    <section className="card">
      <strong>Avisos inteligentes</strong>
      <span className="muted">
        La app revisa tus gastos, metas, deudas y sueldo cada vez que algo cambia y te avisa cuando algo se sale de
        lo normal.
      </span>
      <div className="row between">
        <span>Avisarme con notificación</span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={on}
          aria-label="Avisarme con notificación"
          onClick={() => {
            setSmartNotify(!on)
            setOn(!on)
          }}
        />
      </div>
      {perm === 'default' && <span className="hint">Activa <strong>Avisos</strong> más abajo para permitir notificaciones del sistema.</span>}
      {perm === 'denied' && <span className="hint">Las notificaciones están bloqueadas en este dispositivo. Igual verás los avisos en Inicio.</span>}
      {perm === 'unsupported' && <span className="hint">Este navegador no admite notificaciones; verás los avisos en Inicio.</span>}
      <span className="hint">Las notificaciones salen cuando abres la app. Los avisos de tu pareja llegan al instante.</span>
    </section>
  )
}
