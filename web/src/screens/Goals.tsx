import ScreenHelp from '../components/ScreenHelp'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import SectionHead from '../components/SectionHead'
import Ring from '../components/Ring'
import type { Notify } from '../components/Toast'
import { goalProgress } from '../lib/goals'
import type { GoalState } from '../lib/goals'
import { money, todayISO } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { notifyPartner } from '../lib/push'
import { digitsOnly, shortDate, dots } from '../lib/ui'
import ScopeBar from '../components/ScopeBar'
import { resolveScope, scopeContributions } from '../lib/scope'
import type { Scope } from '../lib/scope'
import Modal from '../components/Modal'
import Spin from '../components/Spin'

const STATE: Record<GoalState, { label: string; tone: 'ok' | 'info' | 'warn' | 'bad' }> = {
  done: { label: 'Cumplida', tone: 'ok' },
  ontrack: { label: 'En camino', tone: 'info' },
  behind: { label: 'Atrasada', tone: 'warn' },
  overdue: { label: 'Fecha vencida', tone: 'bad' },
  open: { label: 'Sin fecha', tone: 'info' },
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function Goals({ hh, data, onToast, scope, onScope }: { hh: Household; data: HouseholdData; onToast: Notify; scope: Scope; onScope: (s: Scope) => void }) {
  const { goals, contributions } = data
  const who = resolveScope(scope, hh.members)
  const person = who === 'all' ? null : hh.members.find((m) => m.user_id === who)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [amt, setAmt] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editGoal, setEditGoal] = useState<string | null>(null)
  const [gName, setGName] = useState('')
  const [gTarget, setGTarget] = useState('')
  const [gDate, setGDate] = useState('')
  const [archiveId, setArchiveId] = useState<string | null>(null)
  const [editC, setEditC] = useState<string | null>(null)
  const [cAmt, setCAmt] = useState('')
  const [cDate, setCDate] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  const members = new Map(hh.everyone.map((m) => [m.user_id, m] as const))

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
    setBusy(false)
    if (err) {
      setError('No se pudo crear la meta')
      return
    }
    setName('')
    setTarget('')
    setDate('')
    setCreating(false)
    onToast(`Meta creada\n**${name.trim()}** ya está en marcha. Hagan el primer aporte cuando quieran.`)
    await data.refresh()
  }

  async function contribute(goalId: string) {
    const n = Number(amt)
    if (n <= 0) return
    setBusy(true)
    setError(null)
    const { data: created, error: err } = await supabase.from('contributions').insert({
      household_id: hh.household.id,
      goal_id: goalId,
      user_id: hh.me.user_id,
      amount: n,
    }).select('id').single()
    setBusy(false)
    if (err) {
      setError('No se pudo registrar el aporte')
      return
    }
    setAmt('')
    setOpenId(null)
    onToast(`Aporte registrado\nSumaste **${money(n)}** a **${goals.find((g) => g.id === goalId)?.name ?? 'la meta'}**.`)
    if (created) notifyPartner('contribution', created.id)
    await data.refresh()
  }

  function startEditGoal(g: HouseholdData['goals'][number]) {
    setEditGoal(g.id)
    setGName(g.name)
    setGTarget(String(g.target_amount))
    setGDate(g.target_date ?? '')
    setArchiveId(null)
  }

  async function saveGoal(id: string) {
    const n = Number(gTarget)
    if (!gName.trim() || !n || n <= 0) {
      setError('Pon un nombre y un monto objetivo mayor a cero')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from('goals')
      .update({ name: gName.trim(), target_amount: n, target_date: gDate || null })
      .eq('id', id)
    setBusy(false)
    if (err) {
      setError('No se pudo guardar la meta')
      return
    }
    setEditGoal(null)
    onToast(`Meta actualizada\nLos cambios en **${gName.trim()}** ya se reflejan.`)
    await data.refresh()
  }

  async function archiveGoal(id: string) {
    if (archiveId !== id) {
      setArchiveId(id)
      return
    }
    const { error: err } = await supabase.from('goals').update({ archived: true }).eq('id', id)
    setArchiveId(null)
    if (err) {
      setError('No se pudo archivar la meta')
      return
    }
    setEditGoal(null)
    onToast('Meta archivada\nSus **aportes** se conservan.', 'info')
    await data.refresh()
  }

  async function saveContribution(id: string) {
    const n = Number(cAmt)
    if (!n || n <= 0 || !cDate || cDate > todayISO()) {
      setError('Revisa el monto y que la fecha no sea futura')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('contributions').update({ amount: n, contributed_on: cDate }).eq('id', id)
    setBusy(false)
    if (err) {
      setError('No se pudo corregir el aporte')
      return
    }
    setEditC(null)
    onToast(`Aporte corregido\nQuedó en **${money(n)}**.`)
    await data.refresh()
  }

  async function removeContribution(id: string) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setError(null)
    const { error: err } = await supabase.from('contributions').delete().eq('id', id)
    setConfirmId(null)
    if (err) {
      setError('No se pudo borrar el aporte')
      return
    }
    onToast('Aporte eliminado\nEl **avance** de la meta se recalculó.', 'info')
    await data.refresh()
  }

  const rows = goals.map((g) => {
    const mine = contributions.filter((c) => c.goal_id === g.id)
    // El avance de la meta es de los dos, pero el historial y los montos se ven de quien se eligió
    const shown = scopeContributions(mine, who)
    return { g, mine, shown, personSaved: shown.reduce((s, c) => s + c.amount, 0), p: goalProgress(g.target_amount, g.target_date, mine) }
  })
  // Primero lo que requiere atención; las cumplidas al final
  const order: Record<GoalState, number> = { overdue: 0, behind: 1, ontrack: 2, open: 3, done: 4 }
  rows.sort((a, b) => order[a.p.state] - order[b.p.state])
  const totalSaved = rows.reduce((s, r) => s + r.p.saved, 0)
  const personTotal = rows.reduce((s, r) => s + r.personSaved, 0)
  const totalTarget = rows.reduce((s, r) => s + r.g.target_amount, 0)
  const totalPct = totalTarget > 0 ? Math.min(100, Math.floor((totalSaved * 100) / totalTarget)) : 0
  const doneCount = rows.filter((r) => r.p.state === 'done').length
  const attention = rows.filter((r) => r.p.state === 'behind' || r.p.state === 'overdue').length

  const [selGoal, setSelGoal] = useState<string | null>(null)
  function closeGoal() {
    setSelGoal(null)
    setEditGoal(null)
    setOpenId(null)
    setEditC(null)
    setArchiveId(null)
    setConfirmId(null)
    setError(null)
  }
  const selRow = rows.find((r) => r.g.id === selGoal)

  const [showAll, setShowAll] = useState(false)
  const PAGE = 2
  const shownRows = showAll ? rows : rows.slice(0, PAGE)

  const renderGoal = ({ g, mine, shown, personSaved, p }: (typeof rows)[number]) => {
    const st = STATE[p.state]
    const barColor = p.state === 'overdue' ? 'var(--warn)' : p.state === 'behind' ? 'var(--amber)' : 'var(--accent)'
    const verdict =
      p.state === 'done'
        ? '¡Lo lograron! 🎉'
        : p.state === 'open'
          ? mine.length === 0
            ? 'Un primer aporte, aunque sea chico, parte la meta.'
            : 'Agrega una fecha y te decimos cuánto aportar al mes.'
          : p.state === 'overdue'
            ? 'La fecha ya pasó: cambia la fecha o sube los aportes.'
            : p.state === 'behind'
              ? `Para llegar a tiempo, aporta ${money(p.perMonth!)} al mes.`
              : `Van bien: aportando ${money(p.perMonth!)} al mes llegan a tiempo.`
    return (
      <div className="card cat-sheet">
        {editGoal === g.id ? (
          <div className="stack cat-detail">
            <div className="row between">
              <strong className="cat-title">Editar información</strong>
              <button type="button" className="btn ghost small" onClick={() => setEditGoal(null)}>
                Cerrar
              </button>
            </div>
            <div className="field">
              <label htmlFor="ge-name">Nombre de la meta</label>
              <input id="ge-name" className="input" maxLength={60} value={gName} onChange={(e) => setGName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ge-target">Cuánto quieren juntar (CLP)</label>
              <input id="ge-target" className="input" inputMode="numeric" value={dots(gTarget)} onChange={(e) => setGTarget(digitsOnly(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ge-date">¿Para cuándo? (opcional)</label>
              <input id="ge-date" className="input" type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} />
            </div>
            <button type="button" className="btn" disabled={busy} onClick={() => void saveGoal(g.id)}>
              {busy ? <Spin label="Guardando…" /> : 'Guardar cambios'}
            </button>
            <button type="button" className="btn danger" onClick={() => void archiveGoal(g.id)}>
              {archiveId === g.id ? '¿Seguro? Se conservan sus aportes' : 'Archivar meta'}
            </button>
          </div>
        ) : (
          <div className="stack cat-detail">
            <div className="row between">
              <span className={`goal-state ${st.tone}`}>{st.label}</span>
              <button type="button" className="btn ghost small" onClick={closeGoal}>
                Cerrar
              </button>
            </div>

            <div className="stack tight">
              <strong className="cat-title">{g.name}</strong>
              <span className="muted">Llevan ahorrado</span>
              <span className="cat-big num">{money(p.saved)}</span>
              <span className="muted">de {money(g.target_amount)}</span>
            </div>

            <div className="stack tight">
              <div className="bar cat-bar" role="img" aria-label={`${g.name}: ${p.pct} % de la meta`}>
                <span style={{ width: `${p.pct}%`, background: barColor }} />
              </div>
              <span className="muted small-text">{p.pct} % logrado</span>
            </div>

            <p className="cat-verdict">{verdict}</p>

            <div className="tiles">
              <div className="tile">
                <span className="muted small-text">Falta</span>
                <span className="amount-sm num">{p.state === 'done' ? '$0' : money(p.remaining)}</span>
              </div>
              <div className="tile">
                <span className="muted small-text">Fecha objetivo</span>
                <span className="amount-sm">{g.target_date ? shortDate(g.target_date) : 'Sin fecha'}</span>
              </div>
              {p.perMonth && p.state !== 'done' && (
                <div className="tile">
                  <span className="muted small-text">Aporte al mes</span>
                  <span className="amount-sm num">{money(p.perMonth)}</span>
                </div>
              )}
              {person ? (
                <div className="tile">
                  <span className="muted small-text">{who === hh.me.user_id ? 'Aportaste tú' : `Aportó ${person.display_name}`}</span>
                  <span className="amount-sm num">{money(personSaved)}</span>
                </div>
              ) : (
                hh.everyone
                  .map((m) => ({ m, total: mine.filter((c) => c.user_id === m.user_id).reduce((t, c) => t + c.amount, 0) }))
                  .filter((x) => x.total > 0)
                  .map(({ m, total }) => (
                    <div className="tile" key={m.user_id}>
                      <span className="muted small-text">Aportó {m.user_id === hh.me.user_id ? 'tú' : m.display_name}</span>
                      <span className="amount-sm num">{money(total)}</span>
                    </div>
                  ))
              )}
            </div>

            {openId === g.id ? (
              <div className="stack cat-edit">
                <div className="field">
                  <label htmlFor={`ap-${g.id}`}>¿Cuánto quieres aportar?</label>
                  <input
                    id={`ap-${g.id}`}
                    className="input"
                    inputMode="numeric"
                    placeholder="Ej. 20000"
                    value={dots(amt)}
                    onChange={(e) => setAmt(digitsOnly(e.target.value))}
                  />
                </div>
                <button type="button" className="btn" disabled={busy} onClick={() => void contribute(g.id)}>
                  {busy ? <Spin label="Registrando aporte…" /> : 'Guardar aporte'}
                </button>
                <button type="button" className="btn ghost" onClick={() => setOpenId(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="stack tight">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setOpenId(g.id)
                    setAmt(p.perMonth && p.state !== 'done' ? String(p.perMonth) : '')
                  }}
                >
                  Aportar a esta meta
                </button>
                <button type="button" className="btn ghost" onClick={() => startEditGoal(g)}>
                  Editar información
                </button>
              </div>
            )}

            {shown.length > 0 && (
              <div className="stack tight cat-edit">
                <button type="button" className="link-btn" aria-expanded={expanded === g.id} onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                  {expanded === g.id ? 'Ocultar los aportes' : `Ver los aportes (${shown.length})`}
                </button>
                {expanded === g.id &&
                  shown.map((c) =>
                    editC === c.id ? (
                      <div className="stack tight item-edit" key={c.id}>
                        <input className="input" inputMode="numeric" value={dots(cAmt)} onChange={(e) => setCAmt(digitsOnly(e.target.value))} aria-label="Monto del aporte" />
                        <input className="input" type="date" max={todayISO()} value={cDate} onChange={(e) => setCDate(e.target.value)} aria-label="Fecha del aporte" />
                        <div className="row">
                          <button type="button" className="btn small" disabled={busy} onClick={() => void saveContribution(c.id)}>
                            {busy ? <Spin label="Guardando…" /> : 'Guardar'}
                          </button>
                          <button type="button" className="btn ghost small" onClick={() => setEditC(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="item" key={c.id}>
                        <Avatar name={members.get(c.user_id)?.display_name} color={members.get(c.user_id)?.color} size={28} />
                        <button
                          type="button"
                          className="item-main grow muted small-text"
                          aria-label="Corregir aporte"
                          onClick={() => {
                            setEditC(c.id)
                            setCAmt(String(c.amount))
                            setCDate(c.contributed_on)
                          }}
                        >
                          {members.get(c.user_id)?.display_name ?? ''} · {shortDate(c.contributed_on)} · toca para corregir
                        </button>
                        <span className="num">{money(c.amount)}</span>
                        <button
                          type="button"
                          className={confirmId === c.id ? 'txt-btn warn' : 'txt-btn'}
                          aria-label={confirmId === c.id ? 'Confirmar borrado' : 'Borrar aporte'}
                          onClick={() => void removeContribution(c.id)}
                        >
                          {confirmId === c.id ? '¿Seguro?' : 'Borrar'}
                        </button>
                      </div>
                    ),
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const heading = who === 'all' ? 'Metas del hogar' : who === hh.me.user_id ? 'Tus metas' : `Metas de ${person?.display_name ?? 'tu pareja'}`

  return (
    <main className="screen">
      <div className="row between">
        <h1 className="title">Metas</h1>
        <ScreenHelp screen="goals" />
      </div>

      <ScopeBar hh={hh} scope={who} onScope={onScope} label="Ver los aportes de" />

      {goals.length === 0 && (
        <section className="card goal-empty">
          <strong>Aún no tienen metas</strong>
          <span className="muted">Creen la primera y empiecen a ahorrar con un objetivo claro.</span>
        </section>
      )}

      {goals.length > 0 && (
        <>
          <SectionHead title={heading} hint="Cuánto llevan ahorrado" />
          <section className="card hero goal-summary" aria-label="Resumen de metas">
            <div className="hero-top">
              <Ring pct={totalPct} />
              <div className="grow">
                <span className="muted small-text">{person ? `Aportado por ${who === hh.me.user_id ? 'ti' : person.display_name}` : 'Ahorrado en total'}</span>
                <span className="amount small num">{money(person ? personTotal : totalSaved)}</span>
                <span className="muted num small-text">de {money(totalTarget)} · {plural(goals.length, 'meta', 'metas')}</span>
              </div>
            </div>
            <div className="stats">
              <div>
                <span className="muted small-text">Cumplidas</span>
                <span className="num strong">{doneCount} de {goals.length}</span>
              </div>
              <div>
                <span className="muted small-text">Necesitan atención</span>
                <span className={attention > 0 ? 'num strong goal-warn' : 'num strong'}>{attention}</span>
              </div>
            </div>
          </section>
        </>
      )}

      {rows.length > 0 && (
        <>
          <SectionHead title="Cada meta" hint="Toca una para aportar, editarla o ver sus aportes" />
          <div className="fixed-grid wide">
            {shownRows.map((r) => {
              const { g, p } = r
              const st = STATE[p.state]
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`fixed-card${p.state === 'done' ? ' paused' : ''}${p.state === 'overdue' || p.state === 'behind' ? ' soon' : ''}`}
                  aria-haspopup="dialog"
                  aria-label={`${g.name}, ${p.pct} % logrado. Toca para ver el detalle`}
                  onClick={() => setSelGoal(g.id)}
                >
                  <span className="fixed-top">
                    <span className="grow fixed-name">
                      <strong>{g.name}</strong>
                      <span className={`goal-state ${st.tone}`}>{st.label}</span>
                    </span>
                    <span className="fixed-amount num">{money(p.saved)}</span>
                  </span>
                  <span className="bar big" aria-hidden="true">
                    <span style={{ width: `${p.pct}%`, background: p.state === 'overdue' ? 'var(--warn)' : p.state === 'behind' ? 'var(--amber)' : 'var(--accent)' }} />
                  </span>
                  <span className="row between muted small-text">
                    <span>{p.pct} % de {money(g.target_amount)}</span>
                    <span>{p.state === 'done' ? 'Alcanzada' : `Falta ${money(p.remaining)}`}</span>
                  </span>
                  <span className="card-cta" aria-hidden="true">
                    Toca para ver el detalle <Icon name="chevR" size={16} />
                  </span>
                </button>
              )
            })}
          </div>
          {rows.length > PAGE && (
            <button type="button" className="btn ghost small wide" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Ver menos metas' : `Ver más (${rows.length - PAGE} metas más)`}
            </button>
          )}
        </>
      )}

      <button type="button" className="btn small wide" onClick={() => setCreating(true)}>
        Agregar meta
      </button>

      {creating && (
        <Modal label="Nueva meta" onClose={() => setCreating(false)}>
          <div className="card cat-sheet">
            <form className="stack cat-detail" onSubmit={(e) => void createGoal(e)}>
              <div className="row between">
                <strong className="cat-title">Agregar meta</strong>
                <button type="button" className="btn ghost small" onClick={() => setCreating(false)}>
                  Cerrar
                </button>
              </div>
              <div className="field">
                <label htmlFor="g-name">¿Qué quieren lograr?</label>
                <input id="g-name" className="input" required maxLength={60} placeholder="Ej. Viaje al sur" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="g-target">¿Cuánto necesitan juntar? (CLP)</label>
                <input id="g-target" className="input" inputMode="numeric" required placeholder="Ej. 500000" value={dots(target)} onChange={(e) => setTarget(digitsOnly(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="g-date">¿Para cuándo? (opcional)</label>
                <input id="g-date" className="input" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? <Spin label="Creando meta…" /> : 'Crear meta'}
              </button>
            </form>
          </div>
        </Modal>
      )}

      {selRow && (
        <Modal label={`Detalle de ${selRow.g.name}`} onClose={closeGoal}>
          {renderGoal(selRow)}
        </Modal>
      )}
    </main>
  )
}
