import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { money } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { digitsOnly, dots } from '../lib/ui'
import type { Notify } from './Toast'
import Spin from './Spin'

/** Gastos típicos: al elegirlos se llena el nombre, se sugiere la categoría y se muestra un ejemplo de monto */
const IDEAS = [
  { name: 'Arriendo', hint: 'El pago mensual de la casa o el departamento.', example: '350000', cat: ['hogar', 'cuentas'] },
  { name: 'Dividendo', hint: 'La cuota del crédito hipotecario de tu vivienda.', example: '420000', cat: ['hogar', 'cuentas'] },
  { name: 'Luz', hint: 'La boleta de electricidad. Si cambia cada mes, pon un promedio.', example: '35000', cat: ['hogar', 'cuentas'] },
  { name: 'Agua', hint: 'La boleta del agua. Si cambia cada mes, pon un promedio.', example: '18000', cat: ['hogar', 'cuentas'] },
  { name: 'Gas', hint: 'Gas de cañería o balones. Pon lo que gastas al mes.', example: '25000', cat: ['hogar', 'cuentas'] },
  { name: 'Internet', hint: 'El plan de internet o fibra de la casa.', example: '22000', cat: ['hogar', 'cuentas'] },
  { name: 'Celular', hint: 'El plan del teléfono. Si son dos, anótalos por separado.', example: '15000', cat: ['hogar', 'cuentas'] },
  { name: 'Streaming', hint: 'Netflix, Spotify, Disney u otra suscripción.', example: '9000', cat: ['ocio'] },
  { name: 'Gimnasio', hint: 'La mensualidad del gimnasio o clases.', example: '25000', cat: ['ocio', 'salud'] },
  { name: 'Seguro', hint: 'Seguro de auto, salud o vida pagado cada mes.', example: '30000', cat: ['salud', 'otros'] },
  { name: 'Colegio', hint: 'Mensualidad del colegio, jardín o universidad.', example: '180000', cat: ['otros'] },
  { name: 'Transporte', hint: 'Pase mensual, bencina fija o estacionamiento.', example: '40000', cat: ['transporte'] },
] as const

const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1)

/** Alta de un gasto fijo (se anota solo cada mes). Vive en Registrar. */
export default function RecurringCreateForm({ hh, data, onToast, onSaved }: { hh: Household; data: HouseholdData; onToast: Notify; onSaved: () => void }) {
  const solo = hh.members.length < 2
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [catId, setCatId] = useState(data.categories[0]?.id ?? '')
  const [paidBy, setPaidBy] = useState(hh.me.user_id)
  const [shared, setShared] = useState(true)
  const [busy, setBusy] = useState(false)
  const [custom, setCustom] = useState(false)
  const setError = useToastError(onToast)
  const idea = IDEAS.find((i) => i.name === note)

  function pickIdea(i: (typeof IDEAS)[number]) {
    setNote(i.name)
    const match = data.categories.find((c) => i.cat.some((k) => c.name.toLowerCase().includes(k)))
    if (match) setCatId(match.id)
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    const d = Number(day)
    if (!note.trim() || n <= 0 || !catId) {
      setError('Falta contar qué es, cuánto cuesta y si es compartido o personal')
      return
    }
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      setError('El día va de 1 a 31')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('recurring_expenses').insert({
      household_id: hh.household.id,
      category_id: catId,
      amount: n,
      note: note.trim(),
      paid_by: solo || !shared ? hh.me.user_id : paidBy,
      shared: solo ? false : shared,
      day_of_month: d,
    })
    if (err) {
      console.error(err)
      setBusy(false)
      setError('No se pudo guardar. Intenta de nuevo.')
      return
    }
    onToast('Gasto fijo guardado\nSe anotará solo cada **mes**.')
    // Puede que el de este mes ya toque: se genera de inmediato
    await supabase.rpc('apply_recurring')
    await data.refresh()
    setBusy(false)
    onSaved()
  }

  return (
    <form className="stack" onSubmit={(e) => void add(e)}>
      <div className="field">
        <label htmlFor="rec-kind">¿Qué pagas?</label>
        <select
          id="rec-kind"
          className="input"
          value={custom ? '__otro' : (idea?.name ?? '')}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__otro') {
              setCustom(true)
              setNote('')
              return
            }
            setCustom(false)
            const i = IDEAS.find((x) => x.name === v)
            if (i) pickIdea(i)
            else setNote('')
          }}
        >
          <option value="">Elige uno…</option>
          {IDEAS.map((i) => (
            <option key={i.name} value={i.name}>
              {i.name}
            </option>
          ))}
          <option value="__otro">Otro (lo escribo yo)</option>
        </select>
      </div>
      {custom && (
        <div className="field">
          <label htmlFor="rec-note">¿Cómo se llama?</label>
          <input id="rec-note" className="input" maxLength={120} placeholder="Ej. Arriendo depto, Plan de celular de Ana"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="rec-amount">Monto al mes (CLP)</label>
        <input id="rec-amount" autoComplete="off" className="input" inputMode="numeric" placeholder={idea ? `Ej. ${idea.example}` : 'Ej. 350000'} value={dots(amount)}
          onChange={(e) => setAmount(digitsOnly(e.target.value))} />
        {amount && <span className="hint num">{money(Number(amount) * 12)} al año</span>}
      </div>
      <div className="field">
        <label htmlFor="rec-day">¿Qué día del mes se paga?</label>
        <select id="rec-day" className="input" value={day} onChange={(e) => setDay(e.target.value)}>
          {dayOptions.map((n) => (
            <option key={n} value={n}>
              Día {n}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rec-cat">Categoría</label>
        <select id="rec-cat" className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {!solo && (
        <>
          <div className="field">
            <span id="rec-who" className="strong">¿Quién lo paga?</span>
            <div className="seg" role="group" aria-labelledby="rec-who">
              {hh.members.map((m) => (
                <button key={m.user_id} type="button" aria-pressed={paidBy === m.user_id} onClick={() => setPaidBy(m.user_id)}>
                  {m.user_id === hh.me.user_id ? 'Yo' : m.display_name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="field">
        <span id="rec-shared" className="strong">¿Es compartido o personal?</span>
        <div className="seg" role="group" aria-labelledby="rec-shared">
          <button type="button" aria-pressed={solo || !shared} onClick={() => setShared(false)}>
            Personal
          </button>
          <button type="button" aria-pressed={!solo && shared} disabled={solo} onClick={() => setShared(true)}>
            Compartido
          </button>
        </div>
        <span className="line-help">
          {solo
            ? 'Compartido se activa cuando tu pareja se une al hogar.'
            : shared
              ? 'Se divide entre los dos: a cada uno le toca su parte.'
              : 'Es solo de quien lo paga.'}
        </span>
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? <Spin label="Guardando gasto fijo…" /> : 'Guardar gasto fijo'}
      </button>
    </form>
  )
}
