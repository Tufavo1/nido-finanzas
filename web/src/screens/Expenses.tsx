import { useMemo, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import ScopeBar from '../components/ScopeBar'
import { splitOf } from '../lib/split'
import { resolveScope, scopeExpenses } from '../lib/scope'
import type { Scope } from '../lib/scope'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import Collapsibles from '../components/Collapsibles'
import SectionHead from '../components/SectionHead'
import { money, todayISO } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { computeMetrics } from '../lib/metrics'
import { groupByDay, whereItWent } from '../lib/moves'
import { Rich } from '../lib/rich'
import { dayHeading, digitsOnly, monthName, dots } from '../lib/ui'
import type { Notify } from '../components/Toast'
import Modal from '../components/Modal'
import Spin from '../components/Spin'
import ExpenseInsights from '../components/ExpenseInsights'

/** 'dom 25' para el filtro por día */
const shortDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return `${d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')} ${d.getDate()}`
}

export default function Expenses({
  hh,
  data,
  month,
  onToast,
  scope,
  onScope,
}: {
  hh: Household
  data: HouseholdData
  month: Date
  onToast: Notify
  scope: Scope
  onScope: (s: Scope) => void
}) {
  const who = resolveScope(scope, hh.members)
  const setWho = (w: Scope) => {
    onScope(w)
    setCatFilter('all')
  }
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editExp, setEditExp] = useState<string | null>(null)
  const [eAmount, setEAmount] = useState('')
  const [eNote, setENote] = useState('')
  const [eCat, setECat] = useState('')
  const [eShared, setEShared] = useState(true)
  const [ePaidBy, setEPaidBy] = useState('')
  const [eDate, setEDate] = useState('')
  const [nameValue, setNameValue] = useState('')
  const [archiveId, setArchiveId] = useState<string | null>(null)
  const [newCat, setNewCat] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [openCat, setOpenCat] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<string>('all')
  const [showAll, setShowAll] = useState(false)
  const [dayFilter, setDayFilter] = useState<string>('all')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  const members = new Map(hh.everyone.map((m) => [m.user_id, m] as const))
  const catName = new Map(data.categories.map((c) => [c.id, c.name] as const))
  const split = useMemo(() => splitOf(hh.members), [hh.members])
  // De una persona: lo suyo y su parte de lo compartido, aunque lo haya pagado la otra
  const list = useMemo(() => scopeExpenses(data.expenses, who, split), [data.expenses, who, split])
  const householdMetrics = useMemo(() => computeMetrics(data.expenses, data.prevExpenses, data.categories, hh.members, month), [data.expenses, data.prevExpenses, data.categories, hh.members, month])
  const person = who === 'all' ? null : members.get(who)

  const spent = new Map<string, number>()
  for (const e of list) spent.set(e.category_id, (spent.get(e.category_id) ?? 0) + e.amount)
  const totalSpent = list.reduce((s, e) => s + e.amount, 0)

  // Métricas de la vista elegida (hogar o una persona)
  const metrics = useMemo(() => {
    const prev = scopeExpenses(data.prevExpenses, who, split)
    return computeMetrics(list, prev, data.categories, hh.members, month)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, data.prevExpenses, data.categories, hh.members, month, who, split])
  const householdTotal = data.expenses.reduce((s, e) => s + e.amount, 0)
  const topCat = metrics.byCategory[0]
  const personStats = person ? householdMetrics.people.find((p) => p.userId === person.user_id) : null
  const delta = metrics.deltaPct

  const byCat = catFilter === 'all' ? list : list.filter((e) => e.category_id === catFilter)
  const days = groupByDay(byCat)
  // Si el día elegido ya no tiene gastos (por ejemplo al cambiar de categoría), se muestra todo el mes
  const activeDay = dayFilter !== 'all' && days.some((g) => g.date === dayFilter) ? dayFilter : 'all'
  const visible = activeDay === 'all' ? byCat : byCat.filter((e) => e.spent_on === activeDay)
  const PAGE = 24
  const shown = showAll ? visible : visible.slice(0, PAGE)

  async function saveBudget(id: string) {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from('categories')
      .update({ monthly_budget: Number(value || '0'), name: nameValue.trim() || undefined })
      .eq('id', id)
    setBusy(false)
    if (err) {
      setError('No se pudo guardar el presupuesto')
      return
    }
    setEditing(null)
    onToast('Categoría actualizada\nEl nuevo **presupuesto** ya está en uso.')
    await data.refresh()
  }

  async function archiveCategory(id: string) {
    if (archiveId !== id) {
      setArchiveId(id)
      return
    }
    setBusy(true)
    const { error: err } = await supabase.from('categories').update({ archived: true }).eq('id', id)
    setBusy(false)
    setArchiveId(null)
    if (err) {
      setError('No se pudo quitar la categoría')
      return
    }
    setEditing(null)
    onToast('Categoría quitada\nSus **gastos** se conservan en el historial.', 'info')
    await data.refresh()
  }

  async function addCategory() {
    const name = newName.trim()
    if (!name) {
      setError('Ponle un nombre a la categoría')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('categories').insert({
      household_id: hh.household.id,
      name,
      monthly_budget: Number(newBudget || '0'),
      position: data.categories.reduce((mx, c) => Math.max(mx, c.position), 0) + 1,
    })
    setBusy(false)
    if (err) {
      setError(err.code === '23505' ? 'Ya existe una categoría con ese nombre' : 'No se pudo crear la categoría')
      return
    }
    setNewCat(false)
    setNewName('')
    setNewBudget('')
    onToast('Categoría creada\nYa puedes **registrar** gastos en ella.')
    await data.refresh()
  }

  function startEdit(e: HouseholdData['expenses'][number]) {
    setEditExp(e.id)
    // Se edita el gasto entero, no solo la parte que le toca a la persona elegida
    setEAmount(String((e as { fullAmount?: number }).fullAmount ?? e.amount))
    setENote(e.note ?? '')
    setECat(e.category_id)
    setEShared(e.shared)
    setEPaidBy(e.paid_by)
    setEDate(e.spent_on)
  }

  async function saveEdit(id: string) {
    const amount = Number(eAmount)
    if (!eDate || eDate > todayISO()) {
      setError('Elige una fecha que no sea futura')
      return
    }
    if (!amount || amount <= 0) {
      setError('Ingresa un monto mayor a cero')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from('expenses')
      .update({ amount, note: eNote.trim() || null, category_id: eCat, shared: eShared, paid_by: ePaidBy, spent_on: eDate })
      .eq('id', id)
    setBusy(false)
    if (err) {
      setError('No se pudo guardar el cambio')
      return
    }
    setEditExp(null)
    onToast('Gasto actualizado\nLos **totales** del mes se recalcularon.')
    await data.refresh()
  }

  async function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setError(null)
    const { error: err } = await supabase.from('expenses').delete().eq('id', id)
    setConfirmId(null)
    if (err) {
      setError('No se pudo borrar el gasto')
      return
    }
    onToast('Gasto eliminado\nSe quitó de los **totales** del mes.', 'info')
    await data.refresh()
  }

  const [selExp, setSelExp] = useState<string | null>(null)
  const selExpRow = selExp ? list.find((e) => e.id === selExp) : undefined
  function closeExp() {
    setSelExp(null)
    setEditExp(null)
    setConfirmId(null)
    setError(null)
  }

  const [selCat, setSelCat] = useState<string | null>(null)
  const selCatRow = data.categories.find((c) => c.id === selCat)
  function closeCat() {
    setSelCat(null)
    setEditing(null)
    setArchiveId(null)
    setOpenCat(null)
    setError(null)
  }

  const renderCat = (c: HouseholdData['categories'][number]) => {
            const s = spent.get(c.id) ?? 0
            const hasBudget = c.monthly_budget > 0
            const over = hasBudget && s > c.monthly_budget
            const pct = hasBudget ? Math.min(100, Math.round((s * 100) / c.monthly_budget)) : 0
            const share = totalSpent > 0 ? Math.round((s * 100) / totalSpent) : 0
            const items = openCat === c.id ? whereItWent(list.filter((e) => e.category_id === c.id)) : []
    return (
              <div className="stack tight cat-row">
                <div className="row between">
                  <strong className="fixed-title">{c.name}</strong>
                  {editing !== c.id && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Editar la categoría ${c.name}`}
                      onClick={() => {
                        setEditing(c.id)
                        setValue(String(c.monthly_budget))
                        setNameValue(c.name)
                        setArchiveId(null)
                      }}
                    >
                      <Icon name="edit" size={20} />
                    </button>
                  )}
                  <button type="button" className="icon-btn" aria-label="Cerrar" onClick={closeCat}>
                    ✕
                  </button>
                </div>
                <div className="row between">
                  <span className={over ? 'over num strong' : 'num strong'}>{money(s)}</span>
                  <span className="muted num small-text">{hasBudget ? `de ${money(c.monthly_budget)}` : 'sin tope definido'}</span>
                </div>
                {hasBudget && (
                  <div className="bar" role="img" aria-label={`${c.name}: ${pct} % del presupuesto`}>
                    <span style={{ width: `${pct}%`, background: over ? 'var(--warn)' : pct >= 80 ? 'var(--amber)' : 'var(--accent)' }} />
                  </div>
                )}
                <span className={over ? 'line-help over' : 'line-help'}>
                  {hasBudget
                    ? over
                      ? `Se pasaron por ${money(s - c.monthly_budget)}.`
                      : `Les quedan ${money(c.monthly_budget - s)} (${100 - pct} % libre).`
                    : 'Toca el lápiz para ponerle un tope mensual.'}
                  {s > 0 && ` · ${share} % de todo lo gastado`}
                </span>
                {s > 0 && (
                  <button type="button" className="link-btn" aria-expanded={openCat === c.id} onClick={() => setOpenCat(openCat === c.id ? null : c.id)}>
                    {openCat === c.id ? 'Ocultar' : 'Ver en qué se fue'}
                  </button>
                )}
                {openCat === c.id && (
                  <div className="where">
                    {items.slice(0, 6).map((it) => (
                      <div className="row between small-text" key={it.label}>
                        <span className="ellipsis">
                          {it.label}
                          {it.count > 1 && <span className="muted"> · {it.count} veces</span>}
                        </span>
                        <span className="num strong">{money(it.total)}</span>
                      </div>
                    ))}
                    {items.length > 6 && <span className="line-help">y {items.length - 6} más en los movimientos.</span>}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setCatFilter(c.id)
                        setShowAll(false)
                        closeCat()
                      }}
                    >
                      Ver solo estos movimientos ↓
                    </button>
                  </div>
                )}
                {editing === c.id && (
                  <div className="stack tight">
                    <label className="line-help" htmlFor={`cn-${c.id}`}>Nombre de la categoría</label>
                    <input id={`cn-${c.id}`} className="input" maxLength={40} value={nameValue} onChange={(e) => setNameValue(e.target.value)} />
                    <label className="line-help" htmlFor={`cb-${c.id}`}>Cuánto quieren gastar al mes en {c.name} (CLP)</label>
                    <input id={`cb-${c.id}`} className="input" inputMode="numeric" placeholder="Ej. 250000" value={dots(value)} onChange={(e) => setValue(digitsOnly(e.target.value))} />
                    <div className="row">
                      <button type="button" className="btn small" disabled={busy} onClick={() => void saveBudget(c.id)}>
                        {busy ? <Spin label="Guardando…" /> : 'Guardar'}
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>
                        Cancelar
                      </button>
                    </div>
                    <button type="button" className="btn danger small" disabled={busy} onClick={() => void archiveCategory(c.id)}>
                      {archiveId === c.id ? '¿Seguro? Se conservan sus gastos' : 'Quitar categoría'}
                    </button>
                  </div>
                )}
              </div>
    )
  }

  return (
    <main className="screen">
      <Collapsibles>
      <h1 className="title">Gastos</h1>

      <ScopeBar hh={hh} scope={who} onScope={setWho} label="Ver los gastos de" />


      <SectionHead title="Resumen del mes" hint="Cuánto se gasta y a qué ritmo" />

      <section className="card">
        <strong>{person ? (person.user_id === hh.me.user_id ? 'Tus números' : `Números de ${person.display_name}`) : 'Números del hogar'} en {monthName(month)}</strong>
        {list.length === 0 ? (
          <span className="muted">Todavía no hay gastos este mes para calcular.</span>
        ) : (
          <>
            <div className="tiles">
              <div className="tile">
                <span className="muted small-text">{person ? (person.user_id === hh.me.user_id ? 'Te corresponde' : 'Le corresponde') : 'Gastaron'}</span>
                <span className="amount-sm num">{money(totalSpent)}</span>
                {person && householdTotal > 0 && (
                  <span className="line-help">{Math.round((totalSpent * 100) / householdTotal)} % de lo que gasta el hogar</span>
                )}
              </div>
              <div className="tile">
                <span className="muted small-text">Cada día en promedio</span>
                <span className="amount-sm num">{money(metrics.avgPerDay)}</span>
                {metrics.projection !== null && <span className="line-help">A este ritmo: {money(metrics.projection)} al cerrar el mes</span>}
              </div>
              <div className="tile">
                <span className="muted small-text">Frente al mes pasado</span>
                <span className="amount-sm num">{delta === null ? 'Sin datos' : delta === 0 ? 'Igual' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} %`}</span>
                <span className="line-help">
                  {delta === null ? 'Aún no hay un mes anterior para comparar' : delta > 0 ? 'Gastan más que antes' : delta < 0 ? 'Gastan menos que antes' : 'Mismo gasto'}
                </span>
              </div>
              {topCat && topCat.spent > 0 && (
                <div className="tile">
                  <span className="muted small-text">Donde más se va</span>
                  <span className="amount-sm">{topCat.name}</span>
                  <span className="line-help">{Math.round((topCat.spent * 100) / Math.max(1, totalSpent))} % del gasto</span>
                </div>
              )}
            </div>
            {personStats && (
              <span className="line-help">
                <Rich text={`De lo que pagó, **${money(personStats.paidShared)}** fue compartido y **${money(personStats.paidPersonal)}** personal. Su costo real del mes es **${money(personStats.trueCost)}**.`} />
              </span>
            )}
            {metrics.topDay && (
              <span className="line-help">
                <Rich text={`Su día más fuerte fue el **${metrics.topDay.day} de ${monthName(month)}** con **${money(metrics.topDay.amount)}**.`} />
              </span>
            )}
          </>
        )}
      </section>

      <SectionHead title="Análisis y presupuestos" hint="Qué dicen los números y cómo va cada categoría" />

      <ExpenseInsights hh={hh} data={data} month={month} who={who} />

      <SectionHead title="Presupuesto por categoría" hint="Toca una categoría para ver en qué se fue, ponerle un tope o editarla" />

      <div className="panel-actions">
        <button type="button" className="btn small" onClick={() => setNewCat(true)}>
          + Nueva categoría
        </button>
      </div>

      <div className="fixed-grid wide">
        {[...data.categories]
          .sort((a, b) => (spent.get(b.id) ?? 0) - (spent.get(a.id) ?? 0))
          .map((c) => {
            const s = spent.get(c.id) ?? 0
            const hasBudget = c.monthly_budget > 0
            const over = hasBudget && s > c.monthly_budget
            const pct = hasBudget ? Math.min(100, Math.round((s * 100) / c.monthly_budget)) : 0
            const share = totalSpent > 0 ? Math.round((s * 100) / totalSpent) : 0
            return (
              <button
                key={c.id}
                type="button"
                className={`fixed-card${over ? ' soon' : ''}`}
                aria-haspopup="dialog"
                aria-label={`${c.name}, ${money(s)} gastado. Toca para ver el detalle`}
                onClick={() => setSelCat(c.id)}
              >
                <span className="fixed-top">
                  <span className="grow fixed-name">
                    <strong>{c.name}</strong>
                    <span className="muted small-text">{share} % de todo lo gastado</span>
                  </span>
                  <span className={over ? 'fixed-amount num over' : 'fixed-amount num'}>{money(s)}</span>
                </span>
                {hasBudget ? (
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${pct}%`, background: over ? 'var(--warn)' : pct >= 80 ? 'var(--amber)' : 'var(--accent)' }} />
                  </span>
                ) : (
                  <span className="bar" aria-hidden="true" />
                )}
                <span className="fixed-next">
                  <span className="fixed-date">
                    <span className="muted small-text">{hasBudget ? 'Tope mensual' : 'Sin tope definido'}</span>
                    <strong>{hasBudget ? money(c.monthly_budget) : 'Ponle un tope'}</strong>
                  </span>
                  {hasBudget && (
                    <span className={over ? 'pill fixed-when soon' : 'pill fixed-when'}>
                      {over ? `Se pasaron ${money(s - c.monthly_budget)}` : `Quedan ${money(c.monthly_budget - s)}`}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
      </div>

      {selCatRow && (
        <Modal label={`Detalle de ${selCatRow.name}`} onClose={closeCat}>
          <div className="card">{renderCat(selCatRow)}</div>
        </Modal>
      )}

      {newCat && (
        <Modal label="Nueva categoría" onClose={() => setNewCat(false)}>
          <div className="card stack tight">
            <strong className="fixed-title">Nueva categoría</strong>
            <label className="line-help" htmlFor="nc-name">Nombre de la nueva categoría</label>
            <input id="nc-name" className="input" maxLength={40} placeholder="Ej. Mascotas, Educación" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <label className="line-help" htmlFor="nc-budget">Tope mensual (opcional)</label>
            <input id="nc-budget" className="input" inputMode="numeric" placeholder="Ej. 80000" value={dots(newBudget)} onChange={(e) => setNewBudget(digitsOnly(e.target.value))} />
            <div className="row">
              <button type="button" className="btn small" disabled={busy} onClick={() => void addCategory()}>
                {busy ? <Spin label="Creando categoría…" /> : 'Crear categoría'}
              </button>
              <button type="button" className="btn ghost small" onClick={() => setNewCat(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      <SectionHead title="Movimientos" hint="Cada gasto anotado, para corregirlo o borrarlo" />

      <section className="card wide">
        <strong>Movimientos de {monthName(month)}</strong>
        <span className="muted small-text">
          {visible.length === 0
            ? 'Sin gastos para mostrar.'
            : `${visible.length} ${visible.length === 1 ? 'gasto' : 'gastos'} por ${money(visible.reduce((s, e) => s + e.amount, 0))}. Toca uno para ver el detalle, corregirlo o borrarlo.`}
        </span>
        <div className="filter-row">
          <span className="filter-label" id="f-cat">Categoría</span>
        <div className="chip-strip" role="group" aria-labelledby="f-cat">
          <button type="button" className="chip" aria-pressed={catFilter === 'all'} onClick={() => setCatFilter('all')}>
            Todas
          </button>
          {data.categories
            .filter((c) => (spent.get(c.id) ?? 0) > 0)
            .map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={catFilter === c.id} onClick={() => setCatFilter(c.id)}>
                {c.name}
              </button>
            ))}
        </div>
        </div>
        {days.length > 1 && (
          <div className="filter-row">
          <span className="filter-label" id="f-day">Día</span>
          <div className="chip-strip" role="group" aria-labelledby="f-day">
            <button type="button" className="chip" aria-pressed={activeDay === 'all'} onClick={() => setDayFilter('all')}>
              Todo el mes
            </button>
            {days.map((g) => (
              <button key={g.date} type="button" className="chip" aria-pressed={activeDay === g.date} aria-label={`${dayHeading(g.date)}, ${money(g.total)}`} onClick={() => setDayFilter(g.date)}>
                <span className="cap">{shortDay(g.date)}</span>
              </button>
            ))}
          </div>
          </div>
        )}
      </section>

      <div className="fixed-grid wide">
            {shown.map((e) => (
              <button
                key={e.id}
                type="button"
                className="fixed-card"
                aria-haspopup="dialog"
                aria-label={`${e.note || catName.get(e.category_id) || 'Gasto'}, ${money(e.amount)}. Toca para ver el detalle`}
                onClick={() => setSelExp(e.id)}
              >
                <span className="fixed-top">
                  <Avatar name={members.get(e.paid_by)?.display_name} color={members.get(e.paid_by)?.color} size={32} />
                  <span className="grow fixed-name">
                    <strong>{e.note || catName.get(e.category_id) || 'Gasto'}</strong>
                    <span className="muted small-text">
                      {catName.get(e.category_id) ?? 'Sin categoría'} · Pagó {members.get(e.paid_by)?.display_name ?? 'alguien'}
                    </span>
                  </span>
                  <span className="fixed-amount num">{money(e.amount)}</span>
                </span>
                <span className="fixed-next">
                  <span className="muted small-text">{dayHeading(e.spent_on)}</span>
                  <span className="tags">
                    <span className={e.shared ? 'tag' : 'tag alt'}>{e.shared ? 'Compartido' : 'Personal'}</span>
                    {e.recurring_id && <span className="tag">Gasto fijo</span>}
                  </span>
                </span>
              </button>
            ))}
      </div>

      {!showAll && visible.length > PAGE && (
        <button type="button" className="btn ghost small wide" onClick={() => setShowAll(true)}>
          Ver los {visible.length} gastos
        </button>
      )}

      {selExpRow && (
        <Modal label={`Detalle de ${selExpRow.note || 'gasto'}`} onClose={closeExp}>
          <div className="card fixed-sheet">
            <div className="row between">
              <span className={selExpRow.shared ? 'tag' : 'tag alt'}>{selExpRow.shared ? 'Compartido' : 'Personal'}</span>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={closeExp}>
                ✕
              </button>
            </div>
            {editExp === selExpRow.id ? (
              <>
                <strong className="fixed-title">Editar gasto</strong>
                <div className="stack tight">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={dots(eAmount)}
                    onChange={(ev) => setEAmount(digitsOnly(ev.target.value))}
                    aria-label="Monto"
                  />
                  <input
                    className="input"
                    maxLength={120}
                    value={eNote}
                    onChange={(ev) => setENote(ev.target.value)}
                    placeholder="Nota (opcional)"
                    aria-label="Nota"
                  />
                  <div className="chips" role="group" aria-label="Categoría">
                    {data.categories.map((c) => (
                      <button key={c.id} type="button" className="chip" aria-pressed={eCat === c.id} onClick={() => setECat(c.id)}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className="seg" role="group" aria-label="Quién pagó">
                    {hh.members.map((m) => (
                      <button key={m.user_id} type="button" aria-pressed={ePaidBy === m.user_id} onClick={() => setEPaidBy(m.user_id)}>
                        {m.display_name}
                      </button>
                    ))}
                  </div>
                  <input
                    className="input"
                    type="date"
                    max={todayISO()}
                    value={eDate}
                    onChange={(ev) => setEDate(ev.target.value)}
                    aria-label="Fecha del gasto"
                  />
                  <div className="row between">
                    <span>Gasto compartido</span>
                    <button
                      type="button"
                      className="switch"
                      role="switch"
                      aria-checked={eShared}
                      aria-label="Gasto compartido"
                      onClick={() => setEShared((v) => !v)}
                    />
                  </div>
                  <div className="row">
                    <button type="button" className="btn small" disabled={busy} onClick={() => void saveEdit(selExpRow.id)}>
                      {busy ? <Spin label="Guardando…" /> : 'Guardar'}
                    </button>
                    <button type="button" className="btn ghost small" onClick={() => setEditExp(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>

              </>
            ) : (
              <>
                <div className="fixed-hero">
                  <strong className="fixed-title">{selExpRow.note || catName.get(selExpRow.category_id) || 'Gasto'}</strong>
                  <span className="amount num">{money(selExpRow.amount)}</span>
                  {person && (selExpRow as { fullAmount?: number }).fullAmount !== undefined && (
                    <span className="muted small-text">
                      {person.user_id === hh.me.user_id ? 'Tu parte' : `Parte de ${person.display_name}`} de un gasto de {money((selExpRow as { fullAmount?: number }).fullAmount!)}
                    </span>
                  )}
                </div>
                <dl className="fixed-facts">
                  <div>
                    <dt>Fecha</dt>
                    <dd>{dayHeading(selExpRow.spent_on)}</dd>
                  </div>
                  <div>
                    <dt>Categoría</dt>
                    <dd>{catName.get(selExpRow.category_id) ?? 'Sin categoría'}</dd>
                  </div>
                  <div>
                    <dt>Pagó</dt>
                    <dd>{members.get(selExpRow.paid_by)?.display_name ?? 'Alguien'}</dd>
                  </div>
                  <div>
                    <dt>Tipo</dt>
                    <dd>{selExpRow.recurring_id ? 'Gasto fijo' : selExpRow.shared ? 'Compartido' : 'Personal'}</dd>
                  </div>
                </dl>
                <div className="fixed-sheet-actions">
                  <button type="button" className="btn small" onClick={() => startEdit(selExpRow)}>
                    Editar
                  </button>
                  <button type="button" className={confirmId === selExpRow.id ? 'btn danger small' : 'btn ghost small'} onClick={() => void remove(selExpRow.id)}>
                    {confirmId === selExpRow.id ? 'Toca otra vez para borrar' : 'Borrar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
      </Collapsibles>
    </main>
  )
}
