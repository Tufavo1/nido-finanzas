import { useState } from 'react'
import Icon from './Icon'
import Modal from './Modal'
import { Rich } from '../lib/rich'
import { compareAlerts } from '../lib/engine'
import type { Alert, AlertTab, MoneySection } from '../lib/engine'

const MARK = { bad: '✕', warn: '!', info: 'i', ok: '✓' } as const
const WORD = { bad: 'Urgente', warn: 'Ojo', info: 'Dato', ok: 'Bien' } as const
/** Cuántos avisos se ven sin abrir la lista */
const VISIBLE = 1

type Go = (tab: AlertTab, section?: MoneySection) => void
type Snooze = (id: string, days: number) => void

function Row({ a, onOpen }: { a: Alert; onOpen: () => void }) {
  return (
    <button type="button" className={`find alert-tile ${a.level}`} onClick={onOpen} aria-haspopup="dialog">
      <span className="alert-title">
        <span className="find-mark" role="img" aria-label={WORD[a.level]}>
          {MARK[a.level]}
        </span>
        <span className="grow">
          <Rich text={a.title} />
        </span>
        <Icon name="chevR" size={18} />
      </span>
      <span className="alert-detail">
        <Rich text={a.detail} />
      </span>
    </button>
  )
}

/** Ventana con el aviso completo y lo que se puede hacer con él */
function AlertModal({ a, onGo, onSnooze, onClose }: { a: Alert; onGo: Go; onSnooze: Snooze; onClose: () => void }) {
  const urgent = a.level === 'bad'
  const act = (f: () => void) => () => {
    onClose()
    f()
  }
  return (
    <Modal label={a.title.replace(/\*\*/g, '')} onClose={onClose}>
      <div className="card alert-modal">
        <span className={`alert-tag ${a.level}`}>{WORD[a.level]}</span>
        <h2 className="alert-modal-title">
          <Rich text={a.title} />
        </h2>
        <p className="alert-modal-detail">
          <Rich text={a.detail} />
        </p>
        {a.tab && a.tab !== 'home' && (
          <button type="button" className="btn" onClick={act(() => onGo(a.tab!, a.section))}>
            {a.action ?? 'Ir a revisarlo'}
          </button>
        )}
        {/* Lo urgente solo se puede recordar mañana. El resto, en 7 días o no mostrar más */}
        {urgent ? (
          <button type="button" className="btn ghost" onClick={act(() => onSnooze(a.id, 1))}>
            Recordármelo mañana
          </button>
        ) : (
          <>
            <button type="button" className="btn ghost" onClick={act(() => onSnooze(a.id, 7))}>
              Recordármelo en 7 días
            </button>
            <button type="button" className="btn ghost" onClick={act(() => onSnooze(a.id, 30))}>
              Ya lo sé, no mostrar más
            </button>
          </>
        )}
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  )
}

/** Lo más importante a la vista, cada aviso en su propia tarjeta con botones claros. El resto, a un toque. */
export default function AlertsCard({ alerts, onGo, onSnooze }: { alerts: Alert[]; onGo: Go; onSnooze: Snooze }) {
  const [open, setOpen] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
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
  const shown = open ? sorted : sorted.slice(0, VISIBLE)
  const hidden = sorted.length - VISIBLE
  const urgent = alerts.filter((a) => a.level === 'bad').length
  const sel = alerts.find((a) => a.id === selId)
  return (
    <section className="card alerts" aria-label="Avisos">
      <div className="row between">
        <strong>Avisos</strong>
        {urgent > 0 && (
          <span className="chip-count bad">
            {urgent} urgente{urgent === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="stack tight">
        {shown.map((a) => (
          <Row key={a.id} a={a} onOpen={() => setSelId(a.id)} />
        ))}
      </div>
      {sel && <AlertModal a={sel} onGo={onGo} onSnooze={onSnooze} onClose={() => setSelId(null)} />}
      {hidden > 0 && (
        <button type="button" className="btn ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Ver menos avisos' : `Ver ${hidden} aviso${hidden === 1 ? '' : 's'} más`}
        </button>
      )}
    </section>
  )
}
