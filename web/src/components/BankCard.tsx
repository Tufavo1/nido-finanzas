// Copyright (c) 2026 Dinovance
import { bankStatus } from '../lib/bankAuto'
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
  return (
    <section className="card bank" aria-labelledby={id}>
      <div className="row between">
        <strong id={id}>Guardar solos los gastos de {bank.name}</strong>
        <button type="button" role="switch" className="switch" aria-checked={bank.autoSave} aria-labelledby={id} disabled={busy || bank.packageName === null} onClick={() => onToggle(!bank.autoSave)} />
      </div>
      <span className="muted small-text">
        Contigo anota solo los gastos de este banco que no superen ${clp.format(cap)}, sin preguntarte. Nunca anota abonos. Si te equivocas, puedes deshacer cada gasto.
      </span>
      <span className={bank.packageName ? 'small-text' : 'small-text strong'}>{bankStatus(bank)}</span>
      <div className="row">
        <button type="button" className="btn ghost small" disabled={busy} onClick={onAssociate}>
          {bank.packageName ? 'Cambiar app' : 'Asociar la app de ' + bank.name}
        </button>
        {bank.packageName && (
          <button type="button" className="btn ghost small" disabled={busy} onClick={onDissociate}>
            Quitar
          </button>
        )}
      </div>
      {bank.packageName === null && <span className="line-help">Para encenderlo, primero asocia la app del banco.</span>}
    </section>
  )
}
