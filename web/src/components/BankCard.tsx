// Copyright (c) 2026 Dinovance
import { CAPTURE_UNAVAILABLE_LABEL, bankStatus } from '../lib/bankAuto'
import type { BankPreset } from '../lib/bankAuto'

interface Props {
  bank: BankPreset
  cap: number
  busy: boolean
  onToggle: (enabled: boolean) => void
  onAssociate: () => void
  onDissociate: () => void
}

const clp = new Intl.NumberFormat('es-CL')

/** Una tarjeta por banco: guardar solos sus gastos (apagado por defecto) y qué app se vigila. */
export default function BankCard({ bank, cap, busy, onToggle, onAssociate, onDissociate }: Props) {
  const id = `bank-${bank.id}`
  if (!bank.available) {
    // Ya la tenía encendida antes de ocultarla: solo se puede apagar
    return (
      <section className="card bank" aria-labelledby={id}>
        <strong id={id}>{bank.name}</strong>
        <span className="muted small-text">{CAPTURE_UNAVAILABLE_LABEL}</span>
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => onToggle(false)}>
          Apagar
        </button>
      </section>
    )
  }
  return (
    <section className="card bank" aria-labelledby={id}>
      <div className="row between tap" onClick={() => !busy && bank.packageName !== null && onToggle(!bank.autoSave)}>
        <strong id={id}>Guardar solos: {bank.name}</strong>
        <button type="button" role="switch" className="switch" aria-checked={bank.autoSave} aria-labelledby={id} disabled={busy || bank.packageName === null} onClick={(e) => { e.stopPropagation(); onToggle(!bank.autoSave) }} />
      </div>
      <span className="muted small-text">
        Hasta ${clp.format(cap)} por gasto. Nunca abonos. Puedes deshacer.
      </span>
      <span className={bank.packageName ? 'small-text' : 'small-text strong'}>{bankStatus(bank)}</span>
      <div className="row">
        <button type="button" className="btn ghost small" disabled={busy} onClick={onAssociate}>
          {bank.packageName ? 'Cambiar app' : 'Elegir app a mano'}
        </button>
        {bank.packageName && (
          <button type="button" className="btn ghost small" disabled={busy} onClick={onDissociate}>
            Quitar
          </button>
        )}
      </div>
      {bank.packageName === null && <span className="line-help">Primero elige la app del banco.</span>}
    </section>
  )
}
