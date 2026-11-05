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

/** Gastos que se repiten cada mes (arriendo, luz, streaming…). Se anotan solos el día indicado. */
export default function RecurringPanel({ hh, data, onToast, scope }: Props) {
  const who = resolveScope(scope, hh.members)
  const person = hh.members.find((m) => m.user_id === who)
  const split = useMemo(() => splitOf(hh.members), [hh.members])
  const list = scopeRecurring(data.recurring, who, split)
  const solo = hh.members.length < 2
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
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
      setError('Falta contar qué es, cuánto cuesta y si es compartido o personal')
      return
    }
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      setError('El día va de 1 a 31')
      return
    }
    const saved = await run(
      () =>
        supabase
          .from('recurring_expenses')
          .update({ note: eNote.trim(), amount: n, day_of_month: d, category_id: eCat, paid_by: solo ? r.paid_by : eShared ? ePaidBy : hh.me.user_id, shared: solo ? false : eShared })
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

      {data.recurring.length === 0 && (
        <section className="card" aria-labelledby="rec-empty">
          <strong id="rec-empty">Todavía no hay gastos fijos</strong>
          <span className="muted">Arriendo, internet, luz… lo que se paga igual todos los meses. Anótalo una vez desde «Registrar» y la app lo tendrá en cuenta.</span>
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
        </>
      )}

      {data.recurring.length > 0 && (
        <div className="cat-actions">
          {sorted.length > PAGE && (
            <button type="button" className="btn ghost small wide" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Ver menos gastos fijos' : `Ver más (${sorted.length - PAGE} gastos fijos más)`}
            </button>
          )}
        </div>
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
                  {selected.shared || selected.paid_by === hh.me.user_id ? (
                    <>
                      <button type="button" className="btn" onClick={() => startEdit(selected)}>
                        Editar información
                      </button>
                      <button type="button" className="btn ghost" disabled={busy} onClick={() => toggle(selected)}>
                        {selected.active ? 'Pausar gasto fijo' : 'Volver a activar'}
                      </button>
                      <button type="button" className={confirmId === selected.id ? 'btn danger' : 'btn ghost'} onClick={() => remove(selected)}>
                        {confirmId === selected.id ? 'Toca otra vez para borrar' : 'Borrar gasto fijo'}
                      </button>
                    </>
                  ) : (
                    <p className="muted small-text">Es un gasto fijo personal de {people.get(selected.paid_by)?.display_name ?? 'tu pareja'}: solo esa persona puede cambiarlo.</p>
                  )}
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
