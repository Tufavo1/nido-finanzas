// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import { Choices } from './RoutedMovement'
import { matchDebt, preselectDebt } from '../lib/debtMatch'
import type { DebtLite } from '../lib/debtMatch'
import { money } from '../lib/format'
import { digitsOnly, dots } from '../lib/ui'

type Target = 'debt' | 'new'

interface Props {
  amount: number
  /** Nombre del gasto: sirve para adivinar la deuda y para prellenar la deuda nueva */
  note: string
  debts: DebtLite[]
  busy: boolean
  onConfirm: (dest: { debtId: string } | { name: string; balance: number }) => void
  onCancel: () => void
}

/** «Fue pago de una deuda»: elige la deuda (la más probable ya marcada) o crea una nueva. Un solo botón para confirmar. */
export default function ExpenseToDebt({ amount, note, debts, busy, onConfirm, onCancel }: Props) {
  const [target, setTarget] = useState<Target>(debts.length > 0 ? 'debt' : 'new')
  const [debtId, setDebtId] = useState<string | null>(preselectDebt(matchDebt(note, debts)))
  const [name, setName] = useState(note)
  const [balance, setBalance] = useState('')
  const bal = Number(balance) || 0
  const ready = target === 'debt' ? debtId !== null : name.trim() !== '' && bal > 0
  return (
    <div className="stack">
      <strong>{`¿A qué deuda fue este pago de ${money(amount)}?`}</strong>
      <span className="muted small-text">El gasto se quita de tus gastos y pasa a ser un pago, así no se cuenta dos veces.</span>
      {debts.length > 0 && (
        <Choices
          label="¿A qué corresponde?"
          value={target}
          options={[
            { value: 'debt' as Target, text: 'Una de mis deudas' },
            { value: 'new' as Target, text: 'Crear una deuda nueva' },
          ]}
          disabled={busy}
          onChange={setTarget}
        />
      )}
      {target === 'debt' && <Choices label="¿Cuál deuda?" value={debtId} options={debts.map((x) => ({ value: x.id, text: x.name }))} disabled={busy} onChange={setDebtId} />}
      {target === 'new' && (
        <div className="stack tight">
          <div className="field">
            <label htmlFor="etd-name">Nombre de la deuda</label>
            <input id="etd-name" className="input" maxLength={60} autoComplete="off" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="etd-bal">¿Cuánto debes en total, antes de este pago?</label>
            <input id="etd-bal" className="input" inputMode="numeric" autoComplete="off" placeholder="Ej. 250.000" value={dots(balance)} disabled={busy} onChange={(e) => setBalance(digitsOnly(e.target.value))} />
          </div>
        </div>
      )}
      {!ready && <span className="muted small-text" id="etd-hint">{target === 'debt' ? 'Elige una deuda para guardar.' : 'Escribe el nombre y cuánto debes.'}</span>}
      <div className="stack tight">
        <button type="button" className="btn" disabled={busy || !ready} aria-describedby={ready ? undefined : 'etd-hint'} onClick={() => onConfirm(target === 'debt' ? { debtId: debtId! } : { name: name.trim(), balance: bal })}>
          Guardar como pago
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
