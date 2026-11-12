import ScreenHelp from '../components/ScreenHelp'
import { useMemo, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import ScopeBar from '../components/ScopeBar'
import { splitOf } from '../lib/split'
import { resolveScope, scopeExpenses } from '../lib/scope'
import type { Scope } from '../lib/scope'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import SectionHead from '../components/SectionHead'
import { money, todayISO } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { computeMetrics } from '../lib/metrics'
import { whereItWent } from '../lib/moves'
import { Rich } from '../lib/rich'
import { dayHeading, digitsOnly, monthName, dots } from '../lib/ui'
import type { Notify } from '../components/Toast'
import Modal from '../components/Modal'
import Spin from '../components/Spin'
import { useDesktop } from '../lib/useDesktop'

export default function Expenses({
  hh,
  data,
  month,
  onToast,
  scope,
  onScope,
  onRegister,
  initialCategory,
}: {
  hh: Household
  data: HouseholdData
  month: Date
  onToast: Notify
  scope: Scope
  onScope: (s: Scope) => void
  /** Lleva a Registrar */
  onRegister?: () => void
  /** Categoría que parte filtrada (cuando se llega tocando una en Inicio) */
  initialCategory?: string
}) {
  // En el celular, solo lo esencial; en el computador, todos los análisis
  const desktop = useDesktop()
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
  const [catFilter, setCatFilter] = useState<string>(initialCategory ?? 'all')
  const [showAll, setShowAll] = useState(false)
  const [showAllCats, setShowAllCats] = useState(false)
  const [dayFilter, setDayFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'oldest' | 'big' | 'small'>('recent')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  const members = new Map(hh.everyone.map((m) => [m.user_id, m] as const))
  const catName = new Map(data.categories.map((c) => [c.id, c.name] as const))
  const split = useMemo(() => splitOf(hh.members), [hh.members])
  // De una persona: lo suyo y su parte de lo compartido, aunque lo haya pagado la otra
  const list = useMemo(() => scopeExpenses(data.expenses, who, split), [data.expenses, who, split])
  const householdMetrics = useMemo(() => computeMetrics(data.expenses, data.prevExpenses, data.categories, hh.members, month), [data.expenses, data.prevExpenses, data.categories, hh.members, month])
  const person = who === 'all' ? null : members.get(who)
  const isMe = person?.user_id === hh.me.user_id
  /** Conjuga según lo que se mira: tú, otra persona o el hogar */
  const verb = (tu: string, el: string, ellos: string) => (isMe ? tu : person ? el : ellos)

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
  // La fecha buscada solo vale dentro del mes que se está mirando
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const activeDay = dayFilter.startsWith(monthPrefix) ? dayFilter : 'all'
  const byDay = activeDay === 'all' ? byCat : byCat.filter((e) => e.spent_on === activeDay)
  // Buscar por la nota o la categoría, sin importar tildes ni mayúsculas
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = norm(query.trim())
  const byText = q ? byDay.filter((e) => norm(`${e.note ?? ''} ${catName.get(e.category_id) ?? ''}`).includes(q)) : byDay
  const visible = [...byText].sort((a, b) => {
    if (sort === 'big') return b.amount - a.amount
    if (sort === 'small') return a.amount - b.amount
    const byDate = a.spent_on.localeCompare(b.spent_on)
    return sort === 'oldest' ? byDate : -byDate
  })
  const filtering = catFilter !== 'all' || activeDay !== 'all' || q !== ''
  function clearFilters() {
    setCatFilter('all')
    setDayFilter('all')
    setQuery('')
    setShowAll(false)
  }
  const PAGE = 2
  const CAT_PAGE = 2
  const sortedCats = [...data.categories].sort((a, b) => (spent.get(b.id) ?? 0) - (spent.get(a.id) ?? 0))
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
      setError('No se pudo guardar el límite. Revisa tu conexión e intenta de nuevo.')
      return
    }
    setEditing(null)
    onToast('Categoría actualizada\nEl nuevo **límite** ya está en uso.')
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
      setError('No se pudo quitar la categoría. Revisa tu conexión e intenta de nuevo.')
      return
    }
    setEditing(null)
    onToast('Categoría quitada\nSus **gastos** se conservan en el historial.', 'info')
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
      setError('Elige una fecha de hoy o anterior')
      return
    }
    if (!amount || amount <= 0) {
      setError('Escribe un monto mayor a cero')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from('expenses')
      .update({ amount, note: eNote.trim() || null, category_id: eCat, shared: eShared, paid_by: eShared ? ePaidBy : hh.me.user_id, spent_on: eDate })
      .eq('id', id)
    setBusy(false)
    if (err) {
      setError('No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.')
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
      setError('No se pudo borrar el gasto. Revisa tu conexión e intenta de nuevo.')
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
    setError(null)
  }

  const renderCat = (c: HouseholdData['categories'][number]) => {
    const s = spent.get(c.id) ?? 0
    const hasBudget = c.monthly_budget > 0
    const over = hasBudget && s > c.monthly_budget
    const pct = hasBudget ? Math.min(100, Math.round((s * 100) / c.monthly_budget)) : 0
    const share = totalSpent > 0 ? Math.round((s * 100) / totalSpent) : 0
    const catList = list.filter((e) => e.category_id === c.id)
    const items = whereItWent(catList)
    const biggest = catList.reduce<(typeof catList)[number] | null>((m, e) => (m === null || e.amount > m.amount ? e : m), null)
    const color = over ? 'var(--warn)' : pct >= 80 ? 'var(--amber)' : 'var(--accent)'
    const verdict = !hasBudget
      ? 'Todavía no tiene límite. Edita la información para ponerle uno.'
      : over
        ? `Se pasaron por ${money(s - c.monthly_budget)}. Conviene gastar menos en esta categoría lo que queda del mes.`
        : pct >= 80
          ? `Casi llegan al límite: les quedan ${money(c.monthly_budget - s)}.`
          : `Van bien: les quedan ${money(c.monthly_budget - s)} para el resto del mes.`
    return (
      <div className="stack cat-detail">
        <div className="row between">
          <strong className="cat-title">{c.name}</strong>
          <button type="button" className="btn ghost small" onClick={closeCat}>
            Cerrar
          </button>
        </div>

        <div className="stack tight">
          <span className="muted">Llevan gastado este mes</span>
          <span className={over ? 'cat-big num over' : 'cat-big num'}>{money(s)}</span>
          <span className="muted">{hasBudget ? `de un límite de ${money(c.monthly_budget)}` : 'Sin límite definido'}</span>
        </div>

        {hasBudget && (
          <div className="stack tight">
            <div className="bar cat-bar" role="img" aria-label={`${c.name}: ${pct} % del límite`}>
              <span style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="muted small-text">{pct} % del límite usado</span>
          </div>
        )}

        <p className={over ? 'cat-verdict over' : 'cat-verdict'}>{verdict}</p>

        <div className="tiles">
          <div className="tile">
            <span className="muted small-text">Del total gastado</span>
            <span className="amount-sm num">{share} %</span>
          </div>
          <div className="tile">
            <span className="muted small-text">Cantidad de gastos</span>
            <span className="amount-sm num">{catList.length}</span>
          </div>
          <div className="tile">
            <span className="muted small-text">Promedio por gasto</span>
            <span className="amount-sm num">{catList.length > 0 ? money(Math.round(s / catList.length)) : '—'}</span>
          </div>
          <div className="tile">
            <span className="muted small-text">Gasto más grande</span>
            <span className="amount-sm num">{biggest ? money(biggest.amount) : '—'}</span>
            {biggest?.note && <span className="line-help ellipsis">{biggest.note}</span>}
          </div>
        </div>

        <div className="stack tight">
          <strong>En qué se fue</strong>
          {items.length === 0 ? (
            <span className="muted">Todavía no hay gastos en esta categoría este mes.</span>
          ) : (
            <div className="where">
              {items.slice(0, 8).map((it) => (
                <div className="row between" key={it.label}>
                  <span className="ellipsis">
                    {it.label}
                    {it.count > 1 && <span className="muted"> · {it.count} veces</span>}
                  </span>
                  <span className="num strong">{money(it.total)}</span>
                </div>
              ))}
              {items.length > 8 && <span className="line-help">y {items.length - 8} más en el historial.</span>}
            </div>
          )}
        </div>

        {editing === c.id ? (
          <div className="stack tight cat-edit">
            <strong>Editar información</strong>
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
        ) : (
          <div className="stack tight">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(c.id)
                setValue(String(c.monthly_budget))
                setNameValue(c.name)
                setArchiveId(null)
              }}
            >
              Editar información
            </button>
            {s > 0 && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setCatFilter(c.id)
                  setShowAll(false)
                  closeCat()
                }}
              >
                Ver solo estos gastos en el historial
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="screen">
      <div className="row between">
        <h1 className="title">Gastos</h1>
        <ScreenHelp screen="expenses" />
      </div>

      <ScopeBar hh={hh} scope={who} onScope={setWho} label="Ver los gastos de" />


      <SectionHead
        title={isMe ? 'Resumen de tu mes' : person ? `Resumen del mes de ${person.display_name}` : 'Resumen del mes'}
        hint={isMe ? 'Cuánta plata se fue este mes y si vas mejor o peor que antes' : person ? `Cuánta plata se fue este mes y si va mejor o peor que antes` : 'Cuánta plata se fue este mes y si van mejor o peor que antes'}
      />

      <section className="card">
        <strong>{person ? (person.user_id === hh.me.user_id ? 'Tus números' : `Números de ${person.display_name}`) : 'Números del hogar'} en {monthName(month)}</strong>
        {list.length === 0 ? (
          <span className="muted">{isMe ? 'Todavía no tienes gastos este mes para calcular.' : person ? `Todavía no hay gastos de ${person.display_name} este mes.` : 'Todavía no hay gastos este mes para calcular.'}</span>
        ) : (
          <>
            <div className="tiles">
              <div className="tile">
                <span className="muted small-text">{person ? (person.user_id === hh.me.user_id ? 'Lo que gastaste' : 'Lo que gastó') : 'Lo que gastaron'}</span>
                <span className="amount-sm num">{money(totalSpent)}</span>
                {person && householdTotal > 0 && (
                  <span className="line-help">{Math.round((totalSpent * 100) / householdTotal)} % de lo que gasta el hogar</span>
                )}
              </div>
              <div className="tile">
                <span className="muted small-text">Gasto por día</span>
                <span className="amount-sm num">{money(metrics.avgPerDay)}</span>
                {metrics.projection !== null && <span className="line-help">{isMe ? 'Si sigues igual, tu mes cerraría en' : person ? `Si sigue igual, el mes de ${person.display_name} cerraría en` : 'Si siguen igual, el mes cerraría en'} {money(metrics.projection)}</span>}
              </div>
              <div className="tile">
                <span className="muted small-text">Frente al mes pasado</span>
                <span className="amount-sm num">{delta === null ? 'Sin datos' : delta === 0 ? 'Igual' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} %`}</span>
                <span className="line-help">
                  {delta === null ? 'Aún no hay un mes anterior para comparar' : delta > 0 ? `${verb('Gastas', 'Gasta', 'Gastan')} más que el mes pasado` : delta < 0 ? `${verb('Gastas', 'Gasta', 'Gastan')} menos que el mes pasado: ¡bien!` : `${verb('Gastas', 'Gasta', 'Gastan')} lo mismo que el mes pasado`}
                </span>
              </div>
              {desktop && topCat && topCat.spent > 0 && (
                <div className="tile">
                  <span className="muted small-text">Donde más se va</span>
                  <span className="amount-sm">{topCat.name}</span>
                  <span className="line-help">{Math.round((topCat.spent * 100) / Math.max(1, totalSpent))} % del gasto</span>
                </div>
              )}
            </div>
            {desktop && personStats && (
              <span className="line-help">
                <Rich text={`${isMe ? 'De lo que pagaste' : 'De lo que pagó'}, **${money(personStats.paidShared)}** fue compartido y **${money(personStats.paidPersonal)}** personal. ${isMe ? 'Tu costo real' : 'Su costo real'} del mes es **${money(personStats.trueCost)}**.`} />
              </span>
            )}
            {desktop && metrics.topDay && (
              <span className="line-help">
                <Rich text={`${isMe ? 'Tu' : person ? 'Su' : 'El'} día más fuerte fue el **${metrics.topDay.day} de ${monthName(month)}** con **${money(metrics.topDay.amount)}**.`} />
              </span>
            )}
          </>
        )}
      </section>

      <SectionHead
        title={isMe ? 'Tu gasto frente al límite' : person ? `Gasto de ${person.display_name} frente al límite` : 'Límite por categoría'}
        hint={
          isMe
            ? 'Cuánto llevas gastado tú en cada tema frente a su límite del mes'
            : person
              ? `Cuánto lleva gastado ${person.display_name} en cada tema frente a su límite del mes`
              : 'Cuánto deciden gastar como máximo cada mes en cada tema'
        }
      />

      <div className="fixed-grid wide">
        {sortedCats
          .slice(0, showAllCats ? undefined : CAT_PAGE)
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
                    <span className="muted small-text">{hasBudget ? 'Límite al mes' : 'Sin límite'}</span>
                    <strong>{hasBudget ? money(c.monthly_budget) : 'Pon un límite'}</strong>
                  </span>
                  {hasBudget && (
                    <span className={over ? 'pill fixed-when soon' : 'pill fixed-when'}>
                      {over ? `Se pasaron ${money(s - c.monthly_budget)}` : `Quedan ${money(c.monthly_budget - s)}`}
                    </span>
                  )}
                </span>
                <span className="card-cta" aria-hidden="true">
                  Toca para ver el detalle <Icon name="chevR" size={16} />
                </span>
              </button>
            )
          })}
      </div>

      <div className="cat-actions">
        {sortedCats.length > CAT_PAGE && (
          <button type="button" className="btn ghost small wide" aria-expanded={showAllCats} onClick={() => setShowAllCats((v) => !v)}>
            {showAllCats ? 'Ver menos categorías' : `Ver más (${sortedCats.length - CAT_PAGE} categorías más)`}
          </button>
        )}
      </div>

      {selCatRow && (
        <Modal label={`Detalle de ${selCatRow.name}`} onClose={closeCat}>
          <div className="card cat-sheet">{renderCat(selCatRow)}</div>
        </Modal>
      )}

      <SectionHead
        title={isMe ? 'Tu historial de gastos' : person ? `Historial de gastos de ${person.display_name}` : 'Historial de gastos'}
        hint={isMe ? 'La lista de cada gasto tuyo, para repasar en qué se fue la plata' : person ? `La lista de cada gasto de ${person.display_name}, para repasar en qué se fue la plata` : 'La lista de cada gasto que anotaron, para repasar en qué se fue la plata'}
      />

      <section className="card wide filter-card" aria-label={`Filtros del historial de ${monthName(month)}`}>
        <div className="filter-head">
          <strong>Historial de {monthName(month)}</strong>
          <span className="muted small-text" role="status">
            {visible.length === 0
              ? 'Sin gastos para mostrar con este filtro.'
              : `${visible.length} ${visible.length === 1 ? 'gasto' : 'gastos'} por ${money(visible.reduce((s, e) => s + e.amount, 0))}. Toca uno para ver el detalle, corregirlo o borrarlo.`}
          </span>
        </div>

        <div className="filter-bar">
          <div className="search-field">
            <Icon name="search" size={20} />
            <label className="sr-only" htmlFor="f-q">Buscar un gasto</label>
            <input
              id="f-q"
              type="search"
              placeholder="Buscar: pan, bencina, almuerzo…"
              maxLength={60}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowAll(false)
              }}
            />
            {query && (
              <button type="button" className="search-clear" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
          <div className="filter-field">
            <label htmlFor="f-cat">Categoría</label>
            <select
              id="f-cat"
              className="input"
              value={catFilter}
              onChange={(e) => {
                setCatFilter(e.target.value)
                setShowAll(false)
              }}
            >
              <option value="all">Todas las categorías</option>
              {sortedCats
                .filter((c) => (spent.get(c.id) ?? 0) > 0)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {money(spent.get(c.id) ?? 0)}
                  </option>
                ))}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="f-date">Día</label>
            <input
              id="f-date"
              className="input"
              type="date"
              min={`${monthPrefix}-01`}
              max={`${monthPrefix}-${String(new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()).padStart(2, '0')}`}
              value={activeDay === 'all' ? '' : activeDay}
              onChange={(e) => {
                setDayFilter(e.target.value || 'all')
                setShowAll(false)
              }}
            />
          </div>
          <div className="filter-field">
            <label htmlFor="f-sort">Orden</label>
            <select id="f-sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="recent">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="big">Mayor monto</option>
              <option value="small">Menor monto</option>
            </select>
          </div>
        </div>

        {filtering && (
          <div className="filter-active">
            <span className="muted small-text">Filtros puestos:</span>
            {catFilter !== 'all' && <span className="pill">{catName.get(catFilter) ?? 'Categoría'}</span>}
            {activeDay !== 'all' && <span className="pill">{dayHeading(activeDay)}</span>}
            {q !== '' && <span className="pill">«{query.trim()}»</span>}
            <button type="button" className="link-btn" onClick={clearFilters}>
              Quitar filtros
            </button>
          </div>
        )}
      </section>

      {list.length === 0 && (
        <section className="card empty" aria-labelledby="exp-empty">
          <strong id="exp-empty">Todavía no hay gastos en {monthName(month)}</strong>
          <span className="muted">Cuando anotes uno, aparecerá aquí para repasarlo, corregirlo o borrarlo.</span>
          {onRegister && (
            <button type="button" className="btn wide" onClick={onRegister}>
              Registrar un gasto
            </button>
          )}
        </section>
      )}

      {list.length > 0 && visible.length === 0 && filtering && (
        <section className="card empty" aria-labelledby="exp-nores">
          <strong id="exp-nores">No encontramos gastos con eso</strong>
          <span className="muted">Prueba con otra palabra o quita los filtros.</span>
          <button type="button" className="btn ghost wide" onClick={clearFilters}>
            Quitar filtros
          </button>
        </section>
      )}

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
                <span className="card-cta" aria-hidden="true">
                  Toca para ver el detalle <Icon name="chevR" size={16} />
                </span>
              </button>
            ))}
      </div>

      {visible.length > PAGE && (
        <button type="button" className="btn ghost small wide" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Ver menos gastos' : `Ver más (${visible.length - PAGE} gastos más)`}
        </button>
      )}

      {selExpRow && (
        <Modal label={`Detalle de ${selExpRow.note || 'gasto'}`} onClose={closeExp}>
          <div className="card cat-sheet">
            <div className="stack cat-detail">
            <div className="row between">
              <span className={selExpRow.shared ? 'tag' : 'tag alt'}>{selExpRow.shared ? 'Compartido' : 'Personal'}</span>
              <button type="button" className="btn ghost small" onClick={closeExp}>
                Cerrar
              </button>
            </div>
            {editExp === selExpRow.id ? (
              <>
                <strong className="cat-title">Editar información</strong>
                <div className="stack tight">
                  <label className="line-help" htmlFor="ee-amount">Monto (CLP)</label>
                  <input
                    id="ee-amount"
                    className="input"
                    inputMode="numeric"
                    value={dots(eAmount)}
                    onChange={(ev) => setEAmount(digitsOnly(ev.target.value))}
                    aria-label="Monto"
                  />
                  <label className="line-help" htmlFor="ee-note">Nota</label>
                  <input
                    id="ee-note"
                    className="input"
                    maxLength={120}
                    value={eNote}
                    onChange={(ev) => setENote(ev.target.value)}
                    placeholder="Nota (opcional)"
                    aria-label="Nota"
                  />
                  <span className="line-help">Categoría</span>
                  <div className="chips" role="group" aria-label="Categoría">
                    {data.categories.map((c) => (
                      <button key={c.id} type="button" className="chip" aria-pressed={eCat === c.id} onClick={() => setECat(c.id)}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                  {eShared && <span className="line-help">Quién pagó</span>}
                  {eShared && <div className="seg" role="group" aria-label="Quién pagó">
                    {hh.members.map((m) => (
                      <button key={m.user_id} type="button" aria-pressed={ePaidBy === m.user_id} onClick={() => setEPaidBy(m.user_id)}>
                        {m.display_name}
                      </button>
                    ))}
                  </div>}
                  <label className="line-help" htmlFor="ee-date">Fecha del gasto</label>
                  <input
                    id="ee-date"
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
                <div className="stack tight">
                  <strong className="cat-title">{selExpRow.note || catName.get(selExpRow.category_id) || 'Gasto'}</strong>
                  <span className="cat-big num">{money(selExpRow.amount)}</span>
                  {person && (selExpRow as { fullAmount?: number }).fullAmount !== undefined && (
                    <span className="muted">
                      {person.user_id === hh.me.user_id ? 'Tu parte' : `Parte de ${person.display_name}`} de un gasto de {money((selExpRow as { fullAmount?: number }).fullAmount!)}
                    </span>
                  )}
                </div>
                <div className="tiles">
                  <div className="tile">
                    <span className="muted small-text">Fecha</span>
                    <span className="amount-sm">{dayHeading(selExpRow.spent_on)}</span>
                  </div>
                  <div className="tile">
                    <span className="muted small-text">Categoría</span>
                    <span className="amount-sm">{catName.get(selExpRow.category_id) ?? 'Sin categoría'}</span>
                  </div>
                  <div className="tile">
                    <span className="muted small-text">Pagó</span>
                    <span className="amount-sm">{members.get(selExpRow.paid_by)?.display_name ?? 'Alguien'}</span>
                  </div>
                  <div className="tile">
                    <span className="muted small-text">Tipo</span>
                    <span className="amount-sm">{selExpRow.recurring_id ? 'Gasto fijo' : selExpRow.shared ? 'Compartido' : 'Personal'}</span>
                  </div>
                </div>
                {totalSpent > 0 && (
                  <p className="cat-verdict">
                    Este gasto es el {Math.round((selExpRow.amount * 100) / totalSpent)} % de todo lo gastado en {monthName(month)}.
                  </p>
                )}
                <div className="stack tight">
                  {selExpRow.shared || selExpRow.paid_by === hh.me.user_id ? (
                    <>
                      <button type="button" className="btn" onClick={() => startEdit(selExpRow)}>
                        Editar información
                      </button>
                      <button type="button" className={confirmId === selExpRow.id ? 'btn danger' : 'btn ghost'} onClick={() => void remove(selExpRow.id)}>
                        {confirmId === selExpRow.id ? 'Toca otra vez para borrar' : 'Borrar gasto'}
                      </button>
                    </>
                  ) : (
                    <p className="muted small-text">Es un gasto personal de {members.get(selExpRow.paid_by)?.display_name ?? 'tu pareja'}: solo esa persona puede cambiarlo o borrarlo.</p>
                  )}
                </div>
              </>
            )}
            </div>
          </div>
        </Modal>
      )}
    </main>
  )
}
