import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData, Recurring } from '../lib/data'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { daysUntil, digitsOnly, inDays, longDate, nextOccurrence } from '../lib/ui'
import Avatar from './Avatar'
import Intro from './Intro'
import type { Notify } from './Toast'
import Spin from './Spin'

interface Props {
  hh: Household
  data: HouseholdData
  onToast: Notify
}

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

  const idea = IDEAS.find((i) => i.name === note)
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
      'Gasto fijo guardado\nSe anotará solo cada **mes**.',
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
      r.active ? 'Gasto fijo en pausa\nNo se anotará hasta que lo **reactives**.' : 'Gasto fijo reactivado\nVolverá a anotarse cada **mes**.',
    )
  }

  function remove(r: Recurring) {
    if (confirmId !== r.id) {
      setConfirmId(r.id)
      return
    }
    setConfirmId(null)
    void run(() => supabase.from('recurring_expenses').delete().eq('id', r.id), 'Gasto fijo eliminado\nYa no se anotará más.')
  }

  return (
    <>
      <Intro
        title="Gastos fijos: lo que pagas igual cada mes"
        text="Son pagos que se repiten todos los meses con el mismo monto: arriendo, luz, internet, celular, suscripciones. Los anotas una sola vez y la app los agrega a tus gastos sola. Para compras que cambian, como el supermercado, usa el botón Registrar."
        steps={[
          'Toca **Agregar un gasto fijo**.',
          'Elige qué es, por ejemplo **Arriendo**, y escribe cuánto pagas al mes.',
          'Elige el **día del mes** en que se paga y su categoría.',
          'Listo: cada mes aparecerá solo en tus gastos. No tienes que anotarlo otra vez.',
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
                    {catName.get(r.category_id) ?? 'Sin categoría'} · todos los meses el día {r.day_of_month}
                  </div>
                  {r.active && (
                    <div className="small-text">
                      Próximo pago: {longDate(nextOccurrence(r.day_of_month))} ({inDays(daysUntil(nextOccurrence(r.day_of_month)))})
                    </div>
                  )}
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
            <strong>Pausar</strong> detiene el gasto sin perder sus datos. Si borras uno que ya se anotó este mes, no vuelve a aparecer.
          </span>
        </section>
      )}

      {open ? (
        <form className="card" onSubmit={(e) => void add(e)}>
          <strong>Agregar un gasto fijo</strong>
          <div className="field">
            <label htmlFor="rec-note">1. ¿Qué pagas? Elige uno o escríbelo</label>
            <div className="chips" role="group" aria-label="Gastos fijos comunes">
              {IDEAS.map((i) => (
                <button key={i.name} type="button" className="chip" aria-pressed={note === i.name} onClick={() => pickIdea(i)}>
                  {i.name}
                </button>
              ))}
            </div>
            {idea && <span className="line-help">{idea.hint}</span>}
            <input id="rec-note" className="input" maxLength={120} placeholder="Ej. Arriendo depto, Plan de celular de Ana"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rec-amount">2. Monto mensual (CLP)</label>
            <span className="line-help">Lo que pagas cada mes. Si varía, pon un promedio.</span>
            <input id="rec-amount" autoComplete="off" className="input" inputMode="numeric" placeholder={idea ? `Ej. ${idea.example}` : 'Ej. 350000'} value={amount}
              onChange={(e) => setAmount(digitsOnly(e.target.value))} />
            {amount && <span className="hint num">Son {money(Number(amount))} al mes, {money(Number(amount) * 12)} al año.</span>}
          </div>
          <div className="field">
            <label htmlFor="rec-day">3. Día del mes en que se paga</label>
            <div className="chips" role="group" aria-label="Días comunes">
              {[1, 5, 10, 15, 20, 25, 30].map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={day === String(n)} onClick={() => setDay(String(n))}>
                  Día {n}
                </button>
              ))}
            </div>
            <span className="line-help">Elige uno o escribe otro número del 1 al 31.</span>
            <input id="rec-day" className="input" inputMode="numeric" value={day}
              onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>
          <div className="field">
            <span id="rec-cat" className="strong">4. Categoría: ¿en qué grupo lo cuentas?</span>
            <span className="line-help">Así aparece en tu presupuesto por categoría en la pestaña Gastos.</span>
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
              {busy ? <Spin label="Guardando gasto fijo…" /> : 'Guardar gasto fijo'}
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
