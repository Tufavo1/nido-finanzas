import { useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Icon from '../components/Icon'
import { money, todayISO } from '../lib/format'
import { supabase } from '../lib/supabase'
import { notifyPartner } from '../lib/push'
import Spin from '../components/Spin'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const

export default function Register({
  hh,
  data,
  onSaved,
}: {
  hh: Household
  data: HouseholdData
  onSaved: (message: string) => void
}) {
  const [digits, setDigits] = useState('')
  const [catId, setCatId] = useState<string>(data.categories[0]?.id ?? '')
  const [paidBy, setPaidBy] = useState(hh.me.user_id)
  const [shared, setShared] = useState(true)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [hasDiscount, setHasDiscount] = useState(false)
  const [discount, setDiscount] = useState('')

  const gross = digits ? Number(digits) : 0
  const pct = hasDiscount ? Math.min(100, Math.max(0, Number(discount.replace(',', '.')) || 0)) : 0
  // Lo que realmente se pagó, ya con el descuento aplicado
  const amount = Math.round(gross * (1 - pct / 100))
  const today = todayISO()

  function press(k: (typeof KEYS)[number]) {
    setDigits((d) => {
      if (k === 'back') return d.slice(0, -1)
      const next = (d + k).replace(/^0+/, '')
      return next.length > 9 ? d : next
    })
  }

  async function save() {
    if (amount <= 0 || !catId || !date || date > today) return
    setBusy(true)
    setError(null)
    const { data: created, error: err } = await supabase.from('expenses').insert({
      household_id: hh.household.id,
      category_id: catId,
      amount,
      paid_by: paidBy,
      shared,
      note: note.trim() || null,
      spent_on: date,
    }).select('id').single()
    if (err) {
      setError('No se pudo guardar. Intenta de nuevo.')
      setBusy(false)
      return
    }
    if (created) notifyPartner('expense', created.id)
    await data.refresh()
    onSaved(`Gasto registrado\nSe anotaron **${money(amount)}** en ${data.categories.find((c) => c.id === catId)?.name ? `**${data.categories.find((c) => c.id === catId)?.name}**` : 'tus gastos'}.`)
  }

  const catName = data.categories.find((c) => c.id === catId)?.name

  return (
    <main className="screen reg">
      <div className="reg-top">
        <div className="reg-amount">
          <span className="muted small-text">{catName ? `Nuevo gasto en ${catName}` : 'Nuevo gasto'}</span>
          <div className={amount > 0 ? 'amount big num' : 'amount big num reg-empty'} aria-live="polite">
            {money(amount)}
          </div>
          {pct > 0 && gross > 0 && (
            <span className="muted small-text">
              {money(gross)} con {pct}% de descuento
            </span>
          )}
        </div>
      </div>
      {data.categories.length === 0 && <p className="muted">Aún no hay categorías para elegir.</p>}

      <div className="chips reg-chips" role="group" aria-label="Categoría">
        {data.categories.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={catId === c.id} onClick={() => setCatId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <section className="reg-card">
        {hh.members.length > 1 && (
          <div className="reg-line">
            <span className="reg-label">Pagó</span>
            <div className="seg" role="group" aria-label="Quién pagó">
              {hh.members.map((m) => (
                <button key={m.user_id} type="button" aria-pressed={paidBy === m.user_id} onClick={() => setPaidBy(m.user_id)}>
                  {m.display_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="reg-togs">
          <button type="button" className="tog" aria-pressed={shared} onClick={() => setShared((v) => !v)}>
            <span className="tog-dot" aria-hidden="true" />
            Compartido
          </button>
          <button type="button" className="tog" aria-pressed={hasDiscount} onClick={() => setHasDiscount((v) => !v)}>
            <span className="tog-dot" aria-hidden="true" />
            Con descuento
          </button>
          {hasDiscount && (
            <div className="reg-pct">
              <input
                className="input"
                inputMode="decimal"
                placeholder="20"
                maxLength={5}
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^\d.,]/g, ''))}
                aria-label="Porcentaje de descuento"
                autoFocus
              />
              <span>%</span>
            </div>
          )}
        </div>

        <div className="reg-meta">
          <input
            id="spent-on"
            className="input"
            type="date"
            max={today}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Fecha del gasto"
          />
          <input
            className="input"
            placeholder="Nota (opcional)"
            maxLength={120}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Nota"
          />
        </div>
      </section>

      <div className="keypad reg-keys">
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
      <button className="btn" type="button" disabled={busy || amount <= 0 || !catId || !date || date > today} onClick={() => void save()}>
        {busy ? <Spin label="Guardando gasto…" /> : amount > 0 ? `Guardar ${money(amount)}` : 'Guardar gasto'}
      </button>
    </main>
  )
}
