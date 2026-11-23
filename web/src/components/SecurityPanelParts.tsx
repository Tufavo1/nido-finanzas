// Copyright (c) 2026 Dinovance
import { COUNTER_LABEL, HEALTH_LABEL, HEALTH_NAME, SEVERITY_LABEL, sortBySeverity } from '../lib/securityPanel'
import type { Health, PanelSeverity, SecurityAlertRow, SecurityEventRow, SecurityOverview } from '../lib/securityPanel'

const nf = new Intl.NumberFormat('es-CL')
const when = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const SEV_MARK: Record<PanelSeverity, string> = { critical: '‼', high: '!', medium: '▲', low: '•', info: 'i' }
const HEALTH_MARK: Record<Health, string> = { ok: '✓', degraded: '!', down: '✕' }

/** La gravedad se dice con texto y símbolo, no solo con color */
export function SeverityBadge({ severity }: { severity: PanelSeverity }) {
  return (
    <span className={`sev sev-${severity}`}>
      <span aria-hidden="true">{SEV_MARK[severity]}</span> {SEVERITY_LABEL[severity]}
    </span>
  )
}

export function CounterTiles({ counters }: { counters: SecurityOverview['counters'] }) {
  const entries = Object.entries(counters)
  if (entries.length === 0) return <p className="muted small-text">El servidor no entregó contadores.</p>
  return (
    <div className="tiles">
      {entries.map(([key, value]) => (
        <div className="tile" key={key}>
          <span className="muted small-text">{COUNTER_LABEL[key] ?? key}</span>
          <span className="amount-sm num">{nf.format(value)}</span>
        </div>
      ))}
    </div>
  )
}

export function HealthList({ health }: { health: SecurityOverview['health'] }) {
  return (
    <ul className="sec-health">
      {(Object.keys(HEALTH_NAME) as (keyof typeof HEALTH_NAME)[]).map((k) => (
        <li key={k} className={`health health-${health[k]}`}>
          <span>{HEALTH_NAME[k]}</span>
          <span className="strong">
            <span aria-hidden="true">{HEALTH_MARK[health[k]]}</span> {HEALTH_LABEL[health[k]]}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AlertList({ alerts, hoursText }: { alerts: SecurityAlertRow[]; hoursText: string }) {
  if (alerts.length === 0) return <p className="muted">No hay alertas en las últimas {hoursText}. Eso no asegura que no haya pasado nada.</p>
  return (
    <ul className="sec-alerts">
      {sortBySeverity(alerts).map((a) => (
        <li key={a.id} className={`sec-alert sev-${a.severity}`}>
          <div className="row between">
            <SeverityBadge severity={a.severity} />
            <span className="muted small-text">{when(a.at)}</span>
          </div>
          <span className="strong">{a.title}</span>
          {a.detail && <span className="line-help">{a.detail}</span>}
        </li>
      ))}
    </ul>
  )
}

export function EventTimeline({ events, hoursText }: { events: SecurityEventRow[]; hoursText: string }) {
  if (events.length === 0) return <p className="muted">No se registraron eventos en las últimas {hoursText}.</p>
  const recent = [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return (
    <ol className="sec-timeline">
      {recent.map((e) => (
        <li key={e.id}>
          <time dateTime={e.at} className="muted small-text">
            {when(e.at)}
          </time>
          <div className="stack tight">
            <span>
              <SeverityBadge severity={e.severity} /> <span className="strong">{e.kind}</span>
            </span>
            {(e.actor_hint || e.detail) && <span className="line-help">{[e.actor_hint, e.detail].filter(Boolean).join(' · ')}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}
