import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData, Recurring } from '../lib/data'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { digitsOnly } from '../lib/ui'
import Avatar from './Avatar'
import Intro from './Intro'

interface Props {
  hh: Household
  data: HouseholdData
  onToast: (text: string) => void
}

const IDEAS = ['Arriendo', 'Luz', 'Agua', 'Gas', 'Internet', 'Celular', 'Streaming'] as const

/** Gastos que se repiten cada mes (arriendo, luz, streaming…). Se anotan solos el día indicado. */
export default function RecurringPanel({ hh, data, onToast }: Props) {
  const solo = hh.members.length < 2
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [catId, setCatId] = useState(data.categories[0]?.id ?? '')
  const [paidBy, setPaidBy] = useState(hh.me.user_id)
  const [shared, setShared] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const catName = new Map(data.categories.map((c) => [c.id, c.name] as const))
  const people = new Map(hh.everyone.map((m) => [m.user_id, m] as const))
  const active = data.recurring.filter((r) => r.active)
  const monthly = active.reduce((s, r) => s + r.amount, 0)

  async function run(task: () => PromiseLike<{ error: unknown }>, ok?: string) {
    setBusy(true)
    setError(null)
    const { error: err } = await task()
    setBusy(false)
    if (err) {
      console.error(err)
      setError('No se pudo guardar. Intenta de nuevo.')
      return false
    }
    if (ok) onToast(ok)
    // Puede que el de este mes ya toque: se genera de inmediato
    await supabase.rpc('apply_recurring')
    await data.refresh()
    return true
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    const d = Number(day)
    if (!note.trim() || n <= 0 || !catId) {
      setError('Completa qué es, cuánto cuesta y el tipo de gasto')
      return
    }
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      setError('El día debe estar entre 1 y 31')
      return
    }
    const saved = await run(
      () =>
        supabase.from('recurring_expenses').insert({
          household_id: hh.household.id,
          category_id: catId,
          amount: n,
          note: note.trim(),
          paid_by: solo ? hh.me.user_id : paidBy,
          shared: solo ? false : shared,
          day_of_month: d,
        }),
      'Gasto fijo guardado',
    )
    if (saved) {
      setNote('')
      setAmount('')
      setOpen(false)
    }
  }

  function toggle(r: Recurring) {
    void run(
      () => supabase.from('recurring_expenses').update({ active: !r.active }).eq('id', r.id),
      r.active ? 'Gasto fijo en pausa' : 'Gasto fijo reactivado',
    )
  }

  function remove(r: Recurring) {
    if (confirmId !== r.id) {
      setConfirmId(r.id)
      return
    }
    setConfirmId(null)
    void run(() => supabase.from('recurring_expenses').delete().eq('id', r.id), 'Gasto fijo eliminado')
  }

  return (
    <>
      <Intro
        title="Gastos fijos: lo que pagas todos los meses"
        text="Son pagos que se repiten siempre, como el arriendo, la luz, el internet o el celular. Los anotas una sola vez y la app los registra sola cada mes, en el día que elijas."
        showSteps={data.recurring.length === 0}
        steps={[
          'Toca «Agregar un gasto fijo».',
          'Escribe qué es, cuánto cuesta y qué día del mes se paga.',
          'Listo: cada mes aparecerá solo entre tus gastos. No tienes que anotarlo de nuevo.',
        ]}
      />

      {active.length > 0 && (
        <section className="card">
          <span className="muted">Entre todos, cada mes pagan</span>
          <span className="amount num">{money(monthly)}</span>
        </section>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {data.recurring.length > 0 && (
        <section className="card">
          <strong>Sus gastos fijos</strong>
          {data.recurring.map((r) => (
            <div key={r.id} style={r.active ? undefined : { opacity: 0.7 }}>
              <div className="item" style={{ paddingBottom: 6 }}>
                {!solo && <Avatar name={people.get(r.paid_by)?.display_name} color={people.get(r.paid_by)?.color} size={28} />}
                <div className="grow">
                  <div className="strong">{r.note}</div>
                  <div className="muted small-text">
                    Se paga el día {r.day_of_month} de cada mes · {catName.get(r.category_id) ?? 'Sin categoría'}
                  </div>
                  {!solo && (
                    <div className="muted small-text">
                      Lo paga {people.get(r.paid_by)?.display_name ?? 'alguien'} ·{' '}
                      {r.shared ? 'se divide entre los dos' : 'es solo de esa persona'}
                    </div>
                  )}
                  {!r.active && <div className="small-text strong">En pausa: no se anota mientras tanto</div>}
                </div>
                <span className="num">{money(r.amount)}</span>
              </div>
              <div className="fixed-actions">
                <button type="button" className="txt-btn" disabled={busy} onClick={() => toggle(r)}>
                  {r.active ? 'Pausar' : 'Volver a activar'}
                </button>
                <button
                  type="button"
                  className={confirmId === r.id ? 'txt-btn warn' : 'txt-btn'}
                  aria-label={confirmId === r.id ? `Confirmar borrado de ${r.note}` : `Borrar ${r.note}`}
                  onClick={() => remove(r)}
                >
                  {confirmId === r.id ? 'Toca otra vez para borrar' : 'Borrar'}
                </button>
              </div>
            </div>
          ))}
          <span className="line-help">
            «Pausar» detiene el gasto sin perder sus datos. Si borras uno que ya se anotó este mes, no vuelve a aparecer.
          </span>
        </section>
      )}

      {open ? (
        <form className="card" onSubmit={(e) => void add(e)}>
          <strong>Agregar un gasto fijo</strong>
          <div className="field">
            <label htmlFor="rec-note">1. ¿Qué es lo que pagas?</label>
            <div className="chips" role="group" aria-label="Ideas">
              {IDEAS.map((i) => (
                <button key={i} type="button" className="chip" aria-pressed={note === i} onClick={() => setNote(i)}>
                  {i}
                </button>
              ))}
            </div>
            <input id="rec-note" className="input" maxLength={120} placeholder="O escríbelo aquí"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rec-amount">2. ¿Cuánto cuesta cada mes?</label>
            <input id="rec-amount" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 350000" value={amount}
              onChange={(e) => setAmount(digitsOnly(e.target.value))} />
            {amount && <span className="hint num">Escribiste: {money(Number(amount))}</span>}
          </div>
          <div className="field">
            <label htmlFor="rec-day">3. ¿Qué día del mes se paga?</label>
            <span className="line-help">Un número del 1 al 31. Por ejemplo, 5.</span>
            <input id="rec-day" className="input" inputMode="numeric" value={day}
              onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>
          <div className="field">
            <span id="rec-cat" className="strong">4. ¿Qué tipo de gasto es?</span>
            <div className="chips" role="group" aria-labelledby="rec-cat">
              {data.categories.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={catId === c.id} onClick={() => setCatId(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          {!solo && (
            <>
              <div className="field">
                <span id="rec-who" className="strong">5. ¿Quién lo paga?</span>
                <div className="seg" role="group" aria-labelledby="rec-who">
                  {hh.members.map((m) => (
                    <button key={m.user_id} type="button" aria-pressed={paidBy === m.user_id} onClick={() => setPaidBy(m.user_id)}>
                      {m.user_id === hh.me.user_id ? 'Yo' : m.display_name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <div className="row between">
                  <span id="rec-shared" className="strong">6. ¿Se divide entre los dos?</span>
                  <button type="button" className="switch" role="switch" aria-checked={shared} aria-labelledby="rec-shared"
                    onClick={() => setShared((s) => !s)} />
                </div>
                <span className="line-help">
                  {shared
                    ? 'Sí: a cada uno le toca la mitad. Si lo paga uno solo, el otro le debe su parte.'
                    : 'No: es un gasto solo de quien lo paga.'}
                </span>
              </div>
            </>
          )}
          <span className="hint">
            {Number(day) > 0 && Number(day) < new Date().getDate()
              ? 'Ese día ya pasó este mes: se anotará desde el próximo mes. Si ya lo pagaste, anótalo como un gasto normal.'
              : 'Se anotará solo cada mes en ese día. Si el mes no tiene ese día, se usa el último.'}
          </span>
          <div className="row">
            <button className="btn small" type="submit" disabled={busy}>
              Guardar gasto fijo
            </button>
            <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Agregar un gasto fijo
        </button>
      )}
    </>
  )
}
