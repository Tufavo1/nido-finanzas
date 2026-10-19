import { useState } from 'react'
import type { Alert, AlertTab } from '../lib/engine'

const MARK = { bad: '✕', warn: '!', info: 'i', ok: '✓' } as const
const WORD = { bad: 'Urgente', warn: 'Ojo', info: 'Dato', ok: 'Bien' } as const

export default function AlertsCard({ alerts, onGo }: { alerts: Alert[]; onGo: (tab: AlertTab) => void }) {
  const [all, setAll] = useState(false)
  if (alerts.length === 0) {
    return (
      <section className="card">
        <strong>Avisos</strong>
        <span className="muted">Todo en orden por ahora. Reviso tus números cada vez que algo cambia.</span>
      </section>
    )
  }
  const shown = all ? alerts : alerts.slice(0, 3)
  return (
    <section className="card" aria-label="Avisos">
      <div className="row between">
        <strong>Avisos ({alerts.length})</strong>
        {alerts.length > 3 && (
          <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>
            {all ? 'Ver menos' : 'Ver todos'}
          </button>
        )}
      </div>
      <div className="stack tight">
        {shown.map((a) => (
          <div className={`find ${a.level}`} key={a.id}>
            <span className="find-mark" aria-label={WORD[a.level]}>
              {MARK[a.level]}
            </span>
            <div className="grow">
              <div className="strong">{a.title}</div>
              <div className="muted small-text">{a.detail}</div>
              {a.tab && a.tab !== 'home' && (
                <button type="button" className="link-btn go" onClick={() => onGo(a.tab!)}>
                  Ir a revisarlo →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
