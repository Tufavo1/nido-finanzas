// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import { SkeletonCard, SkeletonList } from './Skeleton'
import { AlertList, CounterTiles, EventTimeline, HealthList } from './SecurityPanelParts'
import { DEFAULT_HOURS, HEALTH_LABEL, HOUR_OPTIONS, PANEL_LIMIT_NOTICE, hoursLabel, overallHealth } from '../lib/securityPanel'
import { useSecurityOverview } from '../lib/useSecurityOverview'

/** Panel de seguridad del administrador: solo lectura, con indicios y no con certezas. */
export default function SecurityPanel() {
  const [hours, setHours] = useState<number>(DEFAULT_HOURS)
  const { state, reload } = useSecurityOverview(hours)
  const hoursText = hoursLabel(hours)

  return (
    <>
      <p className="card explain sec-limit" role="note">
        <strong>Importante:</strong> {PANEL_LIMIT_NOTICE} No cubre, por ejemplo, ataques que no dejan huella en el servidor ni fallos de otros servicios.
      </p>

      <div className="field">
        <span className="label-text" id="sec-hours-label">
          Período
        </span>
        <div className="seg" role="group" aria-labelledby="sec-hours-label">
          {HOUR_OPTIONS.map((h) => (
            <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}>
              {hoursLabel(h)}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && (
        <>
          <SkeletonCard lines={2} label="Cargando el estado de seguridad…" />
          <SkeletonList rows={3} />
        </>
      )}

      {state.status === 'error' && (
        <section className="card" role="alert">
          <strong>No se pudo cargar el panel de seguridad</strong>
          <span className="muted">Revisa tu conexión. Si sigue pasando, puede que falte la función de seguridad en la base de datos.</span>
          <button type="button" className="btn small" onClick={reload}>
            Reintentar
          </button>
        </section>
      )}

      {state.status === 'ready' && (
        <>
          <section className="card" aria-labelledby="sec-health-title">
            <div className="row between">
              <strong id="sec-health-title">Estado de los servicios</strong>
              <span className="muted small-text">General: {HEALTH_LABEL[overallHealth(state.data.health)]}</span>
            </div>
            <HealthList health={state.data.health} />
          </section>

          <section className="card" aria-labelledby="sec-counters-title">
            <strong id="sec-counters-title">Lo que pasó en las últimas {hoursText}</strong>
            <CounterTiles counters={state.data.counters} />
          </section>

          <section className="card" aria-labelledby="sec-alerts-title">
            <strong id="sec-alerts-title">Alertas</strong>
            <AlertList alerts={state.data.alerts} hoursText={hoursText} />
          </section>

          <section className="card" aria-labelledby="sec-events-title">
            <strong id="sec-events-title">Línea de tiempo</strong>
            <EventTimeline events={state.data.events} hoursText={hoursText} />
          </section>

          <span className="muted small-text">
            Actualizado a las {new Date(state.data.generated_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}.{' '}
            <button type="button" className="link-btn" onClick={reload}>
              Actualizar
            </button>
          </span>
        </>
      )}
    </>
  )
}
