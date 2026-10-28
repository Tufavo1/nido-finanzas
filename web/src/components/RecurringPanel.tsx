import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Household } from '../App'
import type { HouseholdData, Recurring } from '../lib/data'
import { money } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { daysUntil, digitsOnly, inDays, longDate, nextOccurrence, dots } from '../lib/ui'
import { resolveScope, scopeRecurring } from '../lib/scope'
import { splitOf } from '../lib/split'
import { analyzeFixed } from '../lib/fixedInsights'
import { monthIncome } from '../lib/finance'
import type { Scope } from '../lib/scope'
import Avatar from './Avatar'
import Modal from './Modal'
import Collapsibles from './Collapsibles'
import SectionHead from './SectionHead'
import type { Notify } from './Toast'
import FindingList from './FindingList'
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
  // El sueldo es mío: solo se compara con mi parte (vista «Yo»), no con el total del hogar ni con lo de mi pareja
  const mine = who === hh.me.user_id
  const findings = analyzeFixed(
    active.map((r) => ({
      note: r.note,
      amount: r.amount,
      category: data.categories.find((c) => c.id === r.category_id)?.name ?? 'Sin categoría',
      left: daysUntil(nextOccurrence(r.day_of_month)),
    })),
    mine ? monthIncome(data.salary, data.incomes) : null,
  )

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

  // El gasto completo, no la parte de una persona: es el que se edita
  const selected = selId ? (data.recurring.find((r) => r.id === selId) ?? null) : null
  const selectedView = selId ? list.find((r) => r.id === selId) : undefined

  function closeDetail() {
    setSelId(null)
    setEditing(false)
    setConfirmId(null)
  }

  useEffect(() => {
    if (!selId) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDetail()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selId])

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

  return (
    <Collapsibles>
        <div className="panel-actions">
          <button type="button" className="btn small" onClick={() => setOpen(true)}>
            + Agregar un gasto fijo
          </button>
        </div>
      {open && (
        <Modal label="Agregar un gasto fijo" onClose={() => setOpen(false)}>
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
            <input id="rec-amount" autoComplete="off" className="input" inputMode="numeric" placeholder={idea ? `Ej. ${idea.example}` : 'Ej. 350000'} value={dots(amount)}
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
                    ? 'Sí: a cada uno le toca su parte (por defecto la mitad). Si lo paga uno solo, el otro le debe su parte.'
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
        </Modal>
      )}

      {active.length > 0 && <SectionHead title="Cuánto pagan cada mes" hint="El total de lo que se repite solo" />}

      {active.length > 0 && (
        <section className="card">
          <span className="muted">{person ? `${who === hh.me.user_id ? 'Tú pagas' : `${person.display_name} paga`} cada mes` : 'Entre todos, cada mes pagan'}</span>
          <span className="amount num">{money(monthly)}</span>
        </section>
      )}

      {findings.length > 0 && (
        <section className="card" aria-label="Análisis de los gastos fijos">
          <strong>Lo que dice el análisis</strong>
          <FindingList list={findings} />
          <span className="muted small-text">Se calcula con tus gastos fijos y tu sueldo. Son orientaciones, no asesoría financiera.</span>
        </section>
      )}


      {person && list.length === 0 && data.recurring.length > 0 && (
        <section className="card">
          <strong>{who === hh.me.user_id ? 'No tienes' : `${person.display_name} no tiene`} gastos fijos a su nombre</strong>
          <span className="muted">Cambia a Hogar para ver todos los gastos fijos.</span>
        </section>
      )}

      {list.length > 0 && (
        <>
          <SectionHead title="Detalle de cada gasto fijo" hint="Toca uno para ver todo, editarlo, pausarlo o borrarlo" />
          <div className="fixed-grid wide">
            {[...list]
              .sort((x, y) => daysUntil(nextOccurrence(x.day_of_month)) - daysUntil(nextOccurrence(y.day_of_month)))
              .map((r) => {
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
                      {!solo && <Avatar name={who2?.display_name} color={who2?.color} size={32} />}
                      <span className="grow fixed-name">
                        <strong>{r.note}</strong>
                        <span className="muted small-text">{catName.get(r.category_id) ?? 'Sin categoría'}</span>
                      </span>
                      <span className="fixed-amount num">{money(r.amount)}</span>
                    </span>
                    <span className="fixed-next">
                      {r.active ? (
                        <>
                          <span className="fixed-date">
                            <span className="muted small-text">Próximo pago</span>
                            <strong>{next.getDate()} de {longDate(next).split(' de ')[1]}</strong>
                          </span>
                          <span className={left <= 3 ? 'pill fixed-when soon' : 'pill fixed-when'}>{inDays(left)}</span>
                        </>
                      ) : (
                        <span className="pill">En pausa</span>
                      )}
                    </span>
                  </button>
                )
              })}
          </div>
        </>
      )}

      {selected && (
        createPortal(
        <div className="sheet-back" role="presentation" onClick={closeDetail}>
          <div className="sheet card fixed-sheet" role="dialog" aria-modal="true" aria-label={`Detalle de ${selected.note}`} onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <span className="pill">{selected.active ? 'Se anota solo cada mes' : 'En pausa'}</span>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={closeDetail}>
                ✕
              </button>
            </div>
            {!editing ? (
              <>
                <div className="fixed-hero">
                  <strong className="fixed-title">{selected.note}</strong>
                  <span className="amount num">{money(selectedView?.fullAmount ?? selected.amount)}</span>
                  <span className="muted small-text">{money((selectedView?.fullAmount ?? selected.amount) * 12)} al año</span>
                </div>
                <dl className="fixed-facts">
                  <div>
                    <dt>Próximo pago</dt>
                    <dd>{selected.active ? `${longDate(nextOccurrence(selected.day_of_month))} (${inDays(daysUntil(nextOccurrence(selected.day_of_month)))})` : 'Pausado'}</dd>
                  </div>
                  <div>
                    <dt>Se repite</dt>
                    <dd>Todos los meses el día {selected.day_of_month}</dd>
                  </div>
                  <div>
                    <dt>Categoría</dt>
                    <dd>{catName.get(selected.category_id) ?? 'Sin categoría'}</dd>
                  </div>
                  {!solo && (
                    <>
                      <div>
                        <dt>Lo paga</dt>
                        <dd>{people.get(selected.paid_by)?.display_name ?? 'Alguien'}</dd>
                      </div>
                      <div>
                        <dt>División</dt>
                        <dd>
                          {selected.shared ? 'Se divide entre los dos' : 'Es solo de esa persona'}
                          {person && selectedView?.fullAmount !== undefined ? ` · ${who === hh.me.user_id ? 'tu parte' : 'su parte'} ${money(selectedView.amount)}` : ''}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
                <div className="fixed-sheet-actions">
                  <button type="button" className="btn small" onClick={() => startEdit(selected)}>
                    Editar
                  </button>
                  <button type="button" className="btn ghost small" disabled={busy} onClick={() => toggle(selected)}>
                    {selected.active ? 'Pausar' : 'Volver a activar'}
                  </button>
                  <button type="button" className={confirmId === selected.id ? 'btn danger small' : 'btn ghost small'} onClick={() => remove(selected)}>
                    {confirmId === selected.id ? 'Toca otra vez para borrar' : 'Borrar'}
                  </button>
                </div>
                <span className="line-help">
                  <strong>Pausar</strong> detiene el gasto sin perder sus datos. Si borras uno que ya se anotó este mes, no vuelve a aparecer.
                </span>
              </>
            ) : (
              <form className="stack" onSubmit={(e) => void saveEdit(e, selected)}>
                <strong className="fixed-title">Editar gasto fijo</strong>
                <div className="field">
                  <label htmlFor="ed-note">¿Qué pagas?</label>
                  <input id="ed-note" className="input" maxLength={120} value={eNote} onChange={(e) => setENote(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="ed-amount">Monto mensual (CLP)</label>
                  <input id="ed-amount" className="input" inputMode="numeric" autoComplete="off" value={dots(eAmount)} onChange={(e) => setEAmount(digitsOnly(e.target.value))} />
                </div>
                <div className="field">
                  <label htmlFor="ed-day">Día del mes en que se paga</label>
                  <input id="ed-day" className="input" inputMode="numeric" value={eDay} onChange={(e) => setEDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </div>
                <div className="field">
                  <span id="ed-cat" className="strong">Categoría</span>
                  <div className="chips" role="group" aria-labelledby="ed-cat">
                    {data.categories.map((c) => (
                      <button key={c.id} type="button" className="chip" aria-pressed={eCat === c.id} onClick={() => setECat(c.id)}>
                        {c.name}
                      </button>
                    ))}
                  </div>
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
                    <div className="row between">
                      <span id="ed-shared" className="strong">¿Se divide entre los dos?</span>
                      <button type="button" className="switch" role="switch" aria-checked={eShared} aria-labelledby="ed-shared" onClick={() => setEShared((v) => !v)} />
                    </div>
                  </>
                )}
                <div className="row">
                  <button className="btn small" type="submit" disabled={busy}>
                    {busy ? <Spin label="Guardando…" /> : 'Guardar cambios'}
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )
      )}
    </Collapsibles>
  )
}
