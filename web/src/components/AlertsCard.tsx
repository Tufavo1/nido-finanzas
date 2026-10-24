import { useState } from 'react'
import { Rich } from '../lib/rich'
import { compareAlerts } from '../lib/engine'
import type { Alert, AlertTab, MoneySection } from '../lib/engine'

const MARK = { bad: '✕', warn: '!', info: 'i', ok: '✓' } as const
const WORD = { bad: 'Urgente', warn: 'Ojo', info: 'Dato', ok: 'Bien' } as const

type Go = (tab: AlertTab, section?: MoneySection) => void
type Snooze = (id: string, days: number) => void

function Row({ a, onGo, onSnooze }: { a: Alert; onGo: Go; onSnooze: Snooze }) {
  const urgent = a.level === 'bad'
  return (
    <div className={`find ${a.level}`}>
      <span className="find-mark" aria-label={WORD[a.level]}>
        {MARK[a.level]}
      </span>
      <div className="grow">
        <div className="strong"><Rich text={a.title} /></div>
        <div className="muted small-text"><Rich text={a.detail} /></div>
        <div className="alert-actions">
          {a.tab && a.tab !== 'home' && (
            <button type="button" className="link-btn go" onClick={() => onGo(a.tab!, a.section)}>
              {a.action ?? 'Ir a revisarlo'} →
            </button>
          )}
          {/* Lo urgente solo se puede recordar mañana; el resto, posponer o dar por sabido */}
          {urgent ? (
            <button type="button" className="link-btn soft" onClick={() => onSnooze(a.id, 1)}>
              Recordarme mañana
            </button>
          ) : (
            <>
              <button type="button" className="link-btn soft" onClick={() => onSnooze(a.id, 7)}>
                Posponer 7 días
              </button>
              <button type="button" className="link-btn soft" onClick={() => onSnooze(a.id, 30)}>
                Ya lo sé
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Lo más urgente a la vista; el resto, a un toque. Así la plata sigue siendo lo primero que se ve. */
export default function AlertsCard({ alerts, onGo, onSnooze }: { alerts: Alert[]; onGo: Go; onSnooze: Snooze }) {
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
  const sorted = [...alerts].sort(compareAlerts)
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
        <Row a={top!} onGo={onGo} onSnooze={onSnooze} />
        {open && rest.map((a) => <Row key={a.id} a={a} onGo={onGo} onSnooze={onSnooze} />)}
      </div>
    </section>
  )
}
