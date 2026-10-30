import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData, Recurring } from '../lib/data'
import { money } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { daysUntil, digitsOnly, inDays, longDate, nextOccurrence, dots } from '../lib/ui'
import { resolveScope, scopeRecurring } from '../lib/scope'
import { splitOf } from '../lib/split'
import type { Scope } from '../lib/scope'
import Avatar from './Avatar'
import Modal from './Modal'
import Icon from './Icon'
import SectionHead from './SectionHead'
import type { Notify } from './Toast'
import Spin from './Spin'

interface Props {
  hh: Household
  data: HouseholdData
  onToast: Notify
  scope: Scope
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
export default function RecurringPanel({ hh, data, onToast, scope }: Props) {
  const who = resolveScope(scope, hh.members)
  const person = hh.members.find((m) => m.user_id === who)
  const split = useMemo(() => splitOf(hh.members), [hh.members])
  const list = scopeRecurring(data.recurring, who, split)
  const solo = hh.members.length < 2
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [catId, setCatId] = useState(data.categories[0]?.id ?? '')
  const [paidBy, setPaidBy] = useState(who === 'all' ? hh.me.user_id : who)
  const [shared, setShared] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [custom, setCustom] = useState(false)
  const setError = useToastError(onToast)
  // Gasto elegido para ver su detalle y, si se quiere, editarlo
  const [selId, setSelId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [eNote, setENote] = useState('')
  const [eAmount, setEAmount] = useState('')
  const [eDay, setEDay] = useState('1')
  const [eCat, setECat] = useState('')
  const [ePaidBy, setEPaidBy] = useState('')
  const [eShared, setEShared] = useState(false)

  const idea = IDEAS.find((i) => i.name === note)
  const catName = new Map(data.categories.map((c) => [c.id, c.name] as const))
  const people = new Map(hh.everyone.map((m) => [m.user_id, m] as const))
  const active = list.filter((r) => r.active)
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
      setCustom(false)
      setAmount('')
      setOpen(false)
    }
  }

  // El gasto completo, no la parte de una persona: es el que se edita
  const selected = selId ? (data.recurring.find((r) => r.id === selId) ?? null) : null
  const selectedView = selId ? list.find((r) => r.id === selId) : undefined

  function closeDetail() {
    setSelId(null)
    setEditing(false)
    setConfirmId(null)
  }

  function select(r: Recurring) {
    setSelId(r.id)
    setEditing(false)
    setConfirmId(null)
    setError(null)
  }

  function startEdit(r: Recurring) {
    setENote(r.note ?? '')
    setEAmount(String(r.amount))
    setEDay(String(r.day_of_month))
    setECat(r.category_id)
    setEPaidBy(r.paid_by)
    setEShared(r.shared)
    setError(null)
    setEditing(true)
  }

  async function saveEdit(e: FormEvent, r: Recurring) {
    e.preventDefault()
    const n = Number(eAmount)
    const d = Number(eDay)
    if (!eNote.trim() || n <= 0 || !eCat) {
      setError('Completa qué es, cuánto cuesta y el tipo de gasto')
      return
    }
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      setError('El día debe estar entre 1 y 31')
      return
    }
    const saved = await run(
      () =>
        supabase
          .from('recurring_expenses')
          .update({ note: eNote.trim(), amount: n, day_of_month: d, category_id: eCat, paid_by: solo ? r.paid_by : ePaidBy, shared: solo ? false : eShared })
          .eq('id', r.id),
      'Gasto fijo actualizado\nLos cambios valen desde el **próximo** pago.',
    )
    if (saved) setEditing(false)
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
    closeDetail()
    void run(() => supabase.from('recurring_expenses').delete().eq('id', r.id), 'Gasto fijo eliminado\nYa no se anotará más.')
  }

  const sorted = [...list].sort((x, y) => daysUntil(nextOccurrence(x.day_of_month)) - daysUntil(nextOccurrence(y.day_of_month)))
  const PAGE = 2
  const shown = showAll ? sorted : sorted.slice(0, PAGE)
  const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1)

  return (
    <>
      {active.length > 0 && (
        <>
          <SectionHead
            title={person ? (who === hh.me.user_id ? 'Tus gastos fijos' : `Gastos fijos de ${person.display_name}`) : 'Gastos fijos del hogar'}
            hint="Lo que se paga solo cada mes"
          />
          <section className="card">
            <span className="muted">{person ? `${who === hh.me.user_id ? 'Tú pagas' : `${person.display_name} paga`} cada mes` : 'Entre todos, cada mes pagan'}</span>
            <span className="cat-big num">{money(monthly)}</span>
          </section>
        </>
      )}

      {person && list.length === 0 && data.recurring.length > 0 && (
        <section className="card">
          <strong>{who === hh.me.user_id ? 'No tienes' : `${person.display_name} no tiene`} gastos fijos a su nombre</strong>
          <span className="muted">Cambia a Hogar para ver todos.</span>
        </section>
      )}

      {list.length > 0 && (
        <>
          <SectionHead title="Cada gasto fijo" hint="Toca uno para ver todo, editarlo, pausarlo o borrarlo" />
          <div className="fixed-grid wide">
            {shown.map((r) => {
              const next = nextOccurrence(r.day_of_month)
              const left = daysUntil(next)
              const who2 = people.get(r.paid_by)
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`fixed-card${r.active ? '' : ' paused'}${left <= 3 && r.active ? ' soon' : ''}`}
                  aria-haspopup="dialog"
                  aria-label={`${r.note}, ${money(r.amount)} al mes. Toca para ver el detalle`}
                  onClick={() => select(r)}
                >
                  <span className="fixed-top">
                    <Avatar name={who2?.display_name} color={who2?.color} size={32} />
                    <span className="grow fixed-name">
                      <strong>{r.note}</strong>
                      <span className="muted small-text">
                        {catName.get(r.category_id) ?? 'Sin categoría'} · Pagó {who2?.display_name ?? 'alguien'}
                      </span>
                    </span>
                    <span className="fixed-amount num">{money(r.amount)}</span>
                  </span>
                  <span className="fixed-next">
                    <span className="muted small-text">
                      {r.active ? `Próximo pago: ${next.getDate()} de ${longDate(next).split(' de ')[1]} · ${inDays(left)}` : 'En pausa'}
                    </span>
                    <span className="tags">
                      <span className={r.shared ? 'tag' : 'tag alt'}>{r.shared ? 'Compartido' : 'Personal'}</span>
                    </span>
                  </span>
                  <span className="card-cta" aria-hidden="true">
                    Toca para ver el detalle <Icon name="chevR" size={16} />
                  </span>
                </button>
              )
            })}
          </div>
          {sorted.length > PAGE && (
            <button type="button" className="btn ghost small wide" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Ver menos gastos fijos' : `Ver más (${sorted.length - PAGE} gastos fijos más)`}
            </button>
          )}
        </>
      )}

      <button type="button" className="btn small wide" onClick={() => setOpen(true)}>
        Agregar gasto fijo
      </button>

      {open && (
        <Modal label="Agregar gasto fijo" onClose={() => setOpen(false)}>
          <div className="card cat-sheet">
            <form className="stack cat-detail" onSubmit={(e) => void add(e)}>
              <div className="row between">
                <strong className="cat-title">Agregar gasto fijo</strong>
                <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
                  Cerrar
                </button>
              </div>
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
          </div>
        </Modal>
      )}

      {selected && (
        <Modal label={`Detalle de ${selected.note}`} onClose={closeDetail}>
          <div className="card cat-sheet">
            {!editing ? (
              <div className="stack cat-detail">
                <div className="row between">
                  <span className="pill">{selected.active ? 'Se anota solo cada mes' : 'En pausa'}</span>
                  <button type="button" className="btn ghost small" onClick={closeDetail}>
                    Cerrar
                  </button>
                </div>
                <div className="stack tight">
                  <strong className="cat-title">{selected.note}</strong>
                  <span className="cat-big num">{money(selectedView?.fullAmount ?? selected.amount)}</span>
                  <span className="muted">al mes · {money((selectedView?.fullAmount ?? selected.amount) * 12)} al año</span>
                </div>
                <div className="tiles">
                  <div className="tile">
                    <span className="muted small-text">Próximo pago</span>
                    <span className="amount-sm">{selected.active ? inDays(daysUntil(nextOccurrence(selected.day_of_month))) : 'Pausado'}</span>
                    {selected.active && <span className="line-help">{longDate(nextOccurrence(selected.day_of_month))}</span>}
                  </div>
                  <div className="tile">
                    <span className="muted small-text">Se paga</span>
                    <span className="amount-sm">El día {selected.day_of_month}</span>
                  </div>
                  <div className="tile">
                    <span className="muted small-text">Categoría</span>
                    <span className="amount-sm">{catName.get(selected.category_id) ?? 'Sin categoría'}</span>
                  </div>
                  {!solo && (
                    <div className="tile">
                      <span className="muted small-text">Lo paga</span>
                      <span className="amount-sm">{people.get(selected.paid_by)?.display_name ?? 'Alguien'}</span>
                      <span className="line-help">
                        {selected.shared ? 'Se divide entre los dos' : 'Solo de esa persona'}
                        {person && selectedView?.fullAmount !== undefined ? ` · ${who === hh.me.user_id ? 'tu parte' : 'su parte'} ${money(selectedView.amount)}` : ''}
                      </span>
                    </div>
                  )}
                </div>
                <div className="stack tight">
                  <button type="button" className="btn" onClick={() => startEdit(selected)}>
                    Editar información
                  </button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => toggle(selected)}>
                    {selected.active ? 'Pausar gasto fijo' : 'Volver a activar'}
                  </button>
                  <button type="button" className={confirmId === selected.id ? 'btn danger' : 'btn ghost'} onClick={() => remove(selected)}>
                    {confirmId === selected.id ? 'Toca otra vez para borrar' : 'Borrar gasto fijo'}
                  </button>
                </div>
              </div>
            ) : (
              <form className="stack cat-detail" onSubmit={(e) => void saveEdit(e, selected)}>
                <div className="row between">
                  <strong className="cat-title">Editar información</strong>
                  <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
                    Cerrar
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="ed-note">¿Qué pagas?</label>
                  <input id="ed-note" className="input" maxLength={120} value={eNote} onChange={(e) => setENote(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="ed-amount">Monto al mes (CLP)</label>
                  <input id="ed-amount" className="input" inputMode="numeric" autoComplete="off" value={dots(eAmount)} onChange={(e) => setEAmount(digitsOnly(e.target.value))} />
                </div>
                <div className="field">
                  <label htmlFor="ed-day">¿Qué día del mes se paga?</label>
                  <select id="ed-day" className="input" value={eDay} onChange={(e) => setEDay(e.target.value)}>
                    {dayOptions.map((n) => (
                      <option key={n} value={n}>
                        Día {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ed-cat">Categoría</label>
                  <select id="ed-cat" className="input" value={eCat} onChange={(e) => setECat(e.target.value)}>
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
                      <span id="ed-who" className="strong">¿Quién lo paga?</span>
                      <div className="seg" role="group" aria-labelledby="ed-who">
                        {hh.members.map((m) => (
                          <button key={m.user_id} type="button" aria-pressed={ePaidBy === m.user_id} onClick={() => setEPaidBy(m.user_id)}>
                            {m.user_id === hh.me.user_id ? 'Yo' : m.display_name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div className="field">
                  <span id="ed-shared" className="strong">¿Es compartido o personal?</span>
                  <div className="seg" role="group" aria-labelledby="ed-shared">
                    <button type="button" aria-pressed={solo || !eShared} onClick={() => setEShared(false)}>
                      Personal
                    </button>
                    <button type="button" aria-pressed={!solo && eShared} disabled={solo} onClick={() => setEShared(true)}>
                      Compartido
                    </button>
                  </div>
                  <span className="line-help">
                    {solo
                      ? 'Compartido se activa cuando tu pareja se une al hogar.'
                      : eShared
                        ? 'Se divide entre los dos: a cada uno le toca su parte.'
                        : 'Es solo de quien lo paga.'}
                  </span>
                </div>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? <Spin label="Guardando…" /> : 'Guardar cambios'}
                </button>
              </form>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
