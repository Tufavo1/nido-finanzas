import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import Intro from '../components/Intro'
import Ring from '../components/Ring'
import type { Notify } from '../components/Toast'
import { goalProgress } from '../lib/goals'
import type { GoalState } from '../lib/goals'
import { Rich } from '../lib/rich'
import { money, todayISO } from '../lib/format'
import { supabase } from '../lib/supabase'
import { notifyPartner } from '../lib/push'
import { digitsOnly, shortDate, dots } from '../lib/ui'
import ScopeBar from '../components/ScopeBar'
import { resolveScope, scopeContributions } from '../lib/scope'
import type { Scope } from '../lib/scope'
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
  const [error, setError] = useState<string | null>(null)

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

  return (
    <main className="screen">
      <div className="row between">
        <h1 className="title">Metas</h1>
        <button type="button" className="btn small" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cerrar' : 'Nueva meta'}
        </button>
      </div>

      <ScopeBar hh={hh} scope={who} onScope={onScope} label="Ver los aportes de" />

      <Intro
        title="Metas: ahorrar juntos para algo concreto"
        text="Una meta es algo que quieren pagar con ahorro: un viaje, el ahorro para imprevistos, un electrodoméstico. Cada aporte que anotan acerca la barra al objetivo."
        steps={[
          'Toca **Nueva meta**.',
          'Escribe qué quieren lograr y **cuánto cuesta**.',
          'Si tienen una fecha límite, agrégala: la app calcula cuánto aportar **por mes**.',
          'Cada vez que ahorren, abre la meta y toca **Aportar a esta meta**.',
        ]}
      />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {creating && (
        <form className="card" onSubmit={(e) => void createGoal(e)}>
          <strong>Nueva meta</strong>
          <div className="field">
            <label htmlFor="g-name">1. ¿Qué quieren lograr?</label>
            <input id="g-name" className="input" required maxLength={60} placeholder="Ej.: Viaje al sur" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="g-target">2. ¿Cuánto necesitan juntar? (CLP)</label>
            <input
              id="g-target"
              className="input"
              inputMode="numeric"
              required
              value={dots(target)}
              onChange={(e) => setTarget(digitsOnly(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="g-date">3. ¿Para cuándo? (opcional)</label>
            <input id="g-date" className="input" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="hint">Con una fecha, la app te dice cuánto aportar por mes.</span>
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? <Spin label="Creando meta…" /> : 'Crear meta'}
          </button>
        </form>
      )}

      {goals.length === 0 && !creating && (
        <section className="card goal-empty">
          <strong>Aún no tienen metas</strong>
          <span className="muted">Creen la primera y empiecen a ahorrar con un objetivo claro.</span>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Crear la primera meta
          </button>
        </section>
      )}

      {goals.length > 0 && (
        <section className="card hero goal-summary" aria-label="Resumen de metas">
          <div className="hero-top">
            <Ring pct={totalPct} />
            <div className="grow">
              <span className="muted small-text">{person ? `Aportado por ${who === hh.me.user_id ? 'ti' : person.display_name}` : 'Ahorrado en total'}</span>
              <span className="amount small num">{money(person ? personTotal : totalSaved)}</span>
              <span className="muted num small-text">
                {person ? `Entre los dos llevan ${money(totalSaved)} de ${money(totalTarget)}` : `de ${money(totalTarget)} entre ${plural(goals.length, 'meta', 'metas')}`}
              </span>
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
      )}

      {rows.map(({ g, mine, shown, personSaved, p }) => {
        const st = STATE[p.state]
        const byPerson = hh.everyone
          .map((m) => ({ m, total: mine.filter((c) => c.user_id === m.user_id).reduce((s, c) => s + c.amount, 0) }))
          .filter((x) => x.total > 0)
        return (
          <section className="card goal-card" key={g.id}>
            <div className="row between">
              <div className="grow">
                <strong className="goal-name">{g.name}</strong>
              </div>
              <span className={`goal-state ${st.tone}`}>{st.label}</span>
              <button type="button" className="icon-btn" aria-label={`Editar meta ${g.name}`} onClick={() => startEditGoal(g)}>
                <Icon name="edit" size={20} />
              </button>
            </div>
            {editGoal === g.id && (
              <div className="stack tight">
                <input className="input" maxLength={60} value={gName} onChange={(e) => setGName(e.target.value)} aria-label="Nombre de la meta" />
                <input className="input" inputMode="numeric" value={dots(gTarget)} onChange={(e) => setGTarget(digitsOnly(e.target.value))} aria-label="Monto objetivo" />
                <input className="input" type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} aria-label="Fecha objetivo" />
                <div className="row">
                  <button type="button" className="btn small" disabled={busy} onClick={() => void saveGoal(g.id)}>
                    {busy ? <Spin label="Guardando…" /> : 'Guardar'}
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setEditGoal(null)}>
                    Cancelar
                  </button>
                </div>
                <button type="button" className="btn danger small" onClick={() => void archiveGoal(g.id)}>
                  {archiveId === g.id ? '¿Seguro? Se conservan sus aportes' : 'Archivar meta'}
                </button>
              </div>
            )}

            {person && (
              <div className="row between small-text">
                <span className="muted">{who === hh.me.user_id ? 'Aportaste tú' : `Aportó ${person.display_name}`}</span>
                <span className="num strong">{money(personSaved)}</span>
              </div>
            )}
            <div className="goal-figures">
              <span className="amount small num">{money(p.saved)}</span>
              <span className="muted num small-text">de {money(g.target_amount)}</span>
            </div>
            <div className="bar big" role="img" aria-label={`${g.name}: ${p.pct} % de la meta`}>
              <span style={{ width: `${p.pct}%`, background: p.state === 'overdue' ? 'var(--warn)' : p.state === 'behind' ? 'var(--amber)' : 'var(--accent)' }} />
            </div>
            <div className="row between small-text">
              <span className="muted">{p.pct} % logrado</span>
              <span className="muted">{p.state === 'done' ? 'Meta alcanzada' : `Falta ${money(p.remaining)}`}</span>
            </div>

            <p className="goal-verdict">
              <Rich
                text={
                  p.state === 'done'
                    ? '¡Lo lograron! Pueden **archivar** la meta o crear una nueva.'
                    : p.state === 'open'
                      ? mine.length === 0
                        ? 'Todavía no hay aportes. Un primer aporte, aunque sea chico, **parte la meta**.'
                        : 'Sin fecha límite. Si agregan una, la app calcula cuánto **aportar por mes**.'
                      : p.state === 'overdue'
                        ? `La fecha era el **${shortDate(g.target_date!)}**. Cambien la fecha o suban los aportes para completar los **${money(p.remaining)}** que faltan.`
                        : p.state === 'behind'
                          ? `Para llegar el **${shortDate(g.target_date!)}** necesitan aportar **${money(p.perMonth!)} al mes** (${plural(p.monthsLeft!, 'mes', 'meses')}). En los últimos 30 días aportaron **${money(p.recent)}**.`
                          : `Van bien: llegan el **${shortDate(g.target_date!)}** aportando **${money(p.perMonth!)} al mes** (${plural(p.monthsLeft!, 'mes', 'meses')}).`
                }
              />
            </p>

            {!person && byPerson.length > 1 && (
              <div className="goal-split" aria-label="Aporte de cada persona">
                {byPerson.map(({ m, total }) => (
                  <span key={m.user_id} className="row small-text">
                    <Avatar name={m.display_name} color={m.color} size={22} />
                    <span className="muted">{m.display_name}</span>
                    <span className="num strong">{money(total)}</span>
                  </span>
                ))}
              </div>
            )}

            {openId === g.id ? (
              <div className="row">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="Monto"
                  value={dots(amt)}
                  onChange={(e) => setAmt(digitsOnly(e.target.value))}
                  aria-label={`Aporte a ${g.name}`}
                />
                <button type="button" className="btn small" disabled={busy} onClick={() => void contribute(g.id)}>
                  {busy ? <Spin label="Registrando aporte…" /> : 'Aportar'}
                </button>
                <button type="button" className="btn ghost small" onClick={() => setOpenId(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={p.state === 'done' ? 'btn ghost small' : 'btn small'}
                onClick={() => {
                  setOpenId(g.id)
                  setAmt(p.perMonth && p.state !== 'done' ? String(p.perMonth) : '')
                }}
              >
                Aportar a esta meta
              </button>
            )}

            {shown.length > 0 && (
              <div>
                <span className="muted small-text">Historial de aportes</span>
                {(expanded === g.id ? shown : shown.slice(0, 3)).map((c) =>
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
                        {members.get(c.user_id)?.display_name ?? ''} · {shortDate(c.contributed_on)}
                      </button>
                      <span className="num">{money(c.amount)}</span>
                      <button
                        type="button"
                        className={confirmId === c.id ? 'icon-btn confirm' : 'icon-btn'}
                        aria-label={confirmId === c.id ? 'Confirmar borrado' : 'Borrar aporte'}
                        onClick={() => void removeContribution(c.id)}
                      >
                        {confirmId === c.id ? <strong>¿Seguro?</strong> : <Icon name="trash" size={20} />}
                      </button>
                    </div>
                  ),
                )}
                {shown.length > 3 && (
                  <button type="button" className="link-btn" onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                    {expanded === g.id ? 'Ver menos' : `Ver los ${shown.length} aportes`}
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}
    </main>
  )
}
