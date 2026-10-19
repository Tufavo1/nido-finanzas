import { useState } from 'react'
import type { Alert, AlertTab } from '../lib/engine'

const MARK = { bad: '✕', warn: '!', info: 'i', ok: '✓' } as const
const WORD = { bad: 'Urgente', warn: 'Ojo', info: 'Dato', ok: 'Bien' } as const
const RANK = { bad: 0, warn: 1, info: 2, ok: 3 } as const

function Row({ a, onGo }: { a: Alert; onGo: (tab: AlertTab) => void }) {
  return (
    <div className={`find ${a.level}`}>
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
  )
}

/** Lo más urgente a la vista; el resto, a un toque. Así la plata sigue siendo lo primero que se ve. */
export default function AlertsCard({ alerts, onGo }: { alerts: Alert[]; onGo: (tab: AlertTab) => void }) {
  const [open, setOpen] = useState(false)
  if (alerts.length === 0) {
    return (
      <section className="card calm" aria-label="Avisos">
        <span className="find-mark" aria-hidden="true">
          ✓
        </span>
        <span className="muted">Todo en orden por ahora. Reviso tus números cada vez que algo cambia.</span>
      </section>
    )
  }
  const sorted = [...alerts].sort((x, y) => RANK[x.level] - RANK[y.level])
  const [top, ...rest] = sorted
  const urgent = alerts.filter((a) => a.level === 'bad').length
  return (
    <section className="card alerts" aria-label="Avisos">
      <div className="row between">
        <strong>Avisos</strong>
        <span className="row" style={{ gap: 6 }}>
          {urgent > 0 && <span className="chip-count bad">{urgent} urgente{urgent === 1 ? '' : 's'}</span>}
          {rest.length > 0 && (
            <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? 'Ver menos' : `Ver los ${alerts.length}`}
            </button>
          )}
        </span>
      </div>
      <div className="stack tight">
        <Row a={top!} onGo={onGo} />
        {open && rest.map((a) => <Row key={a.id} a={a} onGo={onGo} />)}
      </div>
    </section>
  )
}
