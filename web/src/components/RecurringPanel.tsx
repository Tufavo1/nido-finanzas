import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData, Recurring } from '../lib/data'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { digitsOnly, memberColor } from '../lib/ui'
import Icon from './Icon'

interface Props {
  hh: Household
  data: HouseholdData
  onToast: (text: string) => void
}

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
      setError('Completa el nombre, el monto y la categoría')
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
      <section className="card">
        <strong>Gastos fijos</strong>
        <span className="muted small-text">
          Se anotan solos cada mes en su día, como cualquier otro gasto. Si borras uno ya anotado, no vuelve a aparecer.
        </span>
        {active.length > 0 && (
          <div className="row between">
            <span className="muted">Total mensual</span>
            <span className="amount-sm num">{money(monthly)}</span>
          </div>
        )}
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {data.recurring.length > 0 && (
        <section className="card">
          {data.recurring.map((r) => (
            <div className="item" key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
              {!solo && <span className="dot" style={{ background: memberColor(people.get(r.paid_by)) }} />}
              <div className="grow">
                <div className="ellipsis">{r.note}</div>
                <div className="muted small-text">
                  Día {r.day_of_month} · {catName.get(r.category_id) ?? 'Sin categoría'}
                  {!solo && !r.shared ? ' · personal' : ''}
                  {r.active ? '' : ' · en pausa'}
                </div>
              </div>
              <span className="num">{money(r.amount)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={r.active ? `Pausar ${r.note}` : `Reanudar ${r.note}`}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => supabase.from('recurring_expenses').update({ active: !r.active }).eq('id', r.id),
                    r.active ? 'Gasto fijo en pausa' : 'Gasto fijo reanudado',
                  )
                }
              >
                <Icon name={r.active ? 'pause' : 'play'} size={20} />
              </button>
              <button
                type="button"
                className={confirmId === r.id ? 'icon-btn confirm' : 'icon-btn'}
                aria-label={confirmId === r.id ? 'Confirmar borrado' : `Borrar ${r.note}`}
                onClick={() => remove(r)}
              >
                {confirmId === r.id ? <strong>¿Seguro?</strong> : <Icon name="trash" size={20} />}
              </button>
            </div>
          ))}
        </section>
      )}

      {open ? (
        <form className="card" onSubmit={(e) => void add(e)}>
          <div className="field">
            <label htmlFor="rec-note">Nombre</label>
            <input id="rec-note" className="input" maxLength={120} placeholder="Ej. Arriendo, Internet, Netflix"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="row">
            <div className="field grow">
              <label htmlFor="rec-amount">Monto mensual</label>
              <input id="rec-amount" className="input" inputMode="numeric" value={amount}
                onChange={(e) => setAmount(digitsOnly(e.target.value))} />
            </div>
            <div className="field" style={{ width: 96 }}>
              <label htmlFor="rec-day">Día del mes</label>
              <input id="rec-day" className="input" inputMode="numeric" value={day}
                onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </div>
          </div>
          <div className="chips" role="group" aria-label="Categoría">
            {data.categories.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={catId === c.id} onClick={() => setCatId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          {!solo && (
            <>
              <div className="seg" role="group" aria-label="Quién lo paga">
                {hh.members.map((m) => (
                  <button key={m.user_id} type="button" aria-pressed={paidBy === m.user_id} onClick={() => setPaidBy(m.user_id)}>
                    {m.display_name}
                  </button>
                ))}
              </div>
              <div className="row between">
                <span id="rec-shared">Compartido</span>
                <button type="button" className="switch" role="switch" aria-checked={shared} aria-labelledby="rec-shared"
                  onClick={() => setShared((s) => !s)} />
              </div>
            </>
          )}
          <span className="hint">
            {Number(day) > 0 && Number(day) < new Date().getDate()
              ? 'Ese día ya pasó este mes: se anotará desde el próximo. Si ya lo pagaste, regístralo como gasto normal.'
              : 'Si ese día aún no llega (o es hoy), se anota este mes. Si el mes no tiene ese día, se usa el último.'}
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
          Agregar gasto fijo
        </button>
      )}
    </>
  )
}
