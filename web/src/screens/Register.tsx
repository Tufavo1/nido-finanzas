import { useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Icon from '../components/Icon'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const

export default function Register({
  hh,
  data,
  onSaved,
}: {
  hh: Household
  data: HouseholdData
  onSaved: () => void
}) {
  const [digits, setDigits] = useState('')
  const [catId, setCatId] = useState<string>(data.categories[0]?.id ?? '')
  const [paidBy, setPaidBy] = useState(hh.me.user_id)
  const [shared, setShared] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = digits ? Number(digits) : 0

  function press(k: (typeof KEYS)[number]) {
    setDigits((d) => {
      if (k === 'back') return d.slice(0, -1)
      const next = (d + k).replace(/^0+/, '')
      return next.length > 9 ? d : next
    })
  }

  async function save() {
    if (amount <= 0 || !catId) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('expenses').insert({
      household_id: hh.household.id,
      category_id: catId,
      amount,
      paid_by: paidBy,
      shared,
      note: note.trim() || null,
    })
    if (err) {
      setError('No se pudo guardar. Intenta de nuevo.')
      setBusy(false)
      return
    }
    await data.refresh()
    onSaved()
  }

  return (
    <main className="screen">
      <h1 className="title">Nuevo gasto</h1>
      <div className="amount big num" aria-live="polite">
        {money(amount)}
      </div>

      <div className="chips" role="group" aria-label="Categoría">
        {data.categories.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={catId === c.id} onClick={() => setCatId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="Quién pagó">
        {hh.members.map((m) => (
          <button key={m.user_id} type="button" aria-pressed={paidBy === m.user_id} onClick={() => setPaidBy(m.user_id)}>
            {m.display_name}
          </button>
        ))}
      </div>

      <div className="row between">
        <span>Gasto compartido</span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={shared}
          aria-label="Gasto compartido"
          onClick={() => setShared((s) => !s)}
        />
      </div>

      <input
        className="input"
        placeholder="Nota (opcional)"
        maxLength={120}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Nota"
      />

      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" className="key" onClick={() => press(k)} aria-label={k === 'back' ? 'Borrar' : k}>
            {k === 'back' ? <Icon name="back" /> : k}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn" type="button" disabled={busy || amount <= 0 || !catId} onClick={() => void save()}>
        Guardar gasto
      </button>
    </main>
  )
}
