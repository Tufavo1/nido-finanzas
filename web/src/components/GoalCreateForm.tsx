import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import type { Notify } from './Toast'
import Spin from './Spin'
import { money, todayISO } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { digitsOnly, dots } from '../lib/ui'

/** Alta de una meta nueva. Vive en Registrar. */
export default function GoalCreateForm({ hh, data, onToast, onSaved }: { hh: Household; data: HouseholdData; onToast: Notify; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  async function createGoal(e: FormEvent) {
    e.preventDefault()
    const n = Number(target)
    if (!name.trim() || n <= 0) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('goals').insert({
      household_id: hh.household.id,
      name: name.trim(),
      target_amount: n,
      target_date: date || null,
    })
    if (err) {
      setBusy(false)
      setError('No se pudo crear la meta. Revisa tu conexión e intenta de nuevo.')
      return
    }
    onToast(`Meta creada\n**${name.trim()}** ya está en marcha. Hagan el primer aporte cuando quieran.`)
    await data.refresh()
    setBusy(false)
    onSaved()
  }

  return (
    <form className="stack" onSubmit={(e) => void createGoal(e)}>
      <div className="field">
        <label htmlFor="g-name">¿Qué quieren lograr?</label>
        <input id="g-name" className="input" required maxLength={60} placeholder="Ej. Viaje al sur" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="chips" role="group" aria-label="Ideas de metas">
          {['Viaje', 'Fondo de emergencia', 'Pie de la casa', 'Auto', 'Vacaciones'].map((idea) => (
            <button key={idea} type="button" className="chip" aria-pressed={name === idea} onClick={() => setName(idea)}>
              {idea}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="g-target">¿Cuánto necesitan juntar? (CLP)</label>
        <input id="g-target" className="input" inputMode="numeric" required placeholder="Ej. 500000" value={dots(target)} onChange={(e) => setTarget(digitsOnly(e.target.value))} aria-describedby="g-target-hint" />
        <div className="chips" role="group" aria-label="Montos sugeridos">
          {[100000, 500000, 1000000, 2000000].map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={target === String(v)} onClick={() => setTarget(String(v))}>
              {money(v)}
            </button>
          ))}
        </div>
        <span id="g-target-hint" className={name.trim() && !(Number(target) > 0) ? 'reg-fb bad' : 'muted small-text'}>
          {name.trim() && !(Number(target) > 0) ? 'Escribe cuánto necesitan juntar' : 'Elige un monto o escribe el tuyo'}
        </span>
      </div>
      <div className="field">
        <label htmlFor="g-date">¿Para cuándo? (opcional)</label>
        <input id="g-date" className="input" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={busy || !name.trim() || !(Number(target) > 0)}>
        {busy ? <Spin label="Creando meta…" /> : 'Crear meta'}
      </button>
    </form>
  )
}
