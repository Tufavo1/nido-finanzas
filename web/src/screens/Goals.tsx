import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import Ring from '../components/Ring'
import { money, todayISO } from '../lib/format'
import { supabase } from '../lib/supabase'
import { notifyPartner } from '../lib/push'
import { digitsOnly, shortDate } from '../lib/ui'

export default function Goals({ hh, data }: { hh: Household; data: HouseholdData }) {
  const { goals, contributions } = data
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
    await data.refresh()
  }

  return (
    <main className="screen">
      <div className="row between">
        <h1 className="title">Metas</h1>
        <button type="button" className="btn small" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cerrar' : 'Nueva meta'}
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {creating && (
        <form className="card" onSubmit={(e) => void createGoal(e)}>
          <div className="field">
            <label htmlFor="g-name">Nombre</label>
            <input id="g-name" className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="g-target">Monto objetivo (CLP)</label>
            <input
              id="g-target"
              className="input"
              inputMode="numeric"
              required
              value={target}
              onChange={(e) => setTarget(digitsOnly(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="g-date">Fecha objetivo (opcional)</label>
            <input id="g-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            Crear meta
          </button>
        </form>
      )}

      {goals.length === 0 && !creating && <p className="muted">Aún no tienen metas. Creen la primera.</p>}

      {goals.map((g) => {
        const mine = contributions.filter((c) => c.goal_id === g.id)
        const saved = mine.reduce((s, c) => s + c.amount, 0)
        const pct = g.target_amount > 0 ? Math.min(100, Math.round((saved * 100) / g.target_amount)) : 0
        return (
          <section className="card" key={g.id}>
            <div className="row between">
              <strong>{g.name}</strong>
              <div className="row">
                <button type="button" className="icon-btn" aria-label={`Editar meta ${g.name}`} onClick={() => startEditGoal(g)}>
                  <Icon name="edit" size={20} />
                </button>
              </div>
            </div>
            {editGoal === g.id && (
              <div className="stack tight">
                <input className="input" maxLength={60} value={gName} onChange={(e) => setGName(e.target.value)} aria-label="Nombre de la meta" />
                <input className="input" inputMode="numeric" value={gTarget} onChange={(e) => setGTarget(digitsOnly(e.target.value))} aria-label="Monto objetivo" />
                <input className="input" type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} aria-label="Fecha objetivo" />
                <div className="row">
                  <button type="button" className="btn small" disabled={busy} onClick={() => void saveGoal(g.id)}>
                    Guardar
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
            <div className="goal-body">
              <Ring pct={pct} />
              <div className="grow">
                <span className="amount small num">{money(saved)}</span>
                <div className="muted num small-text">
                  de {money(g.target_amount)}
                  {g.target_date ? ` · para ${shortDate(g.target_date)}` : ''}
                </div>
                <div className={saved >= g.target_amount ? 'notice small-text' : 'muted small-text'}>
                  {saved >= g.target_amount ? '¡Meta cumplida!' : `Faltan ${money(g.target_amount - saved)}`}
                </div>
              </div>
            </div>

            {openId === g.id ? (
              <div className="row">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="Monto"
                  value={amt}
                  onChange={(e) => setAmt(digitsOnly(e.target.value))}
                  aria-label={`Aporte a ${g.name}`}
                />
                <button type="button" className="btn small" disabled={busy} onClick={() => void contribute(g.id)}>
                  Aportar
                </button>
                <button type="button" className="btn ghost small" onClick={() => setOpenId(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  setOpenId(g.id)
                  setAmt('')
                }}
              >
                Aportar
              </button>
            )}

            <div>
              {(expanded === g.id ? mine : mine.slice(0, 3)).map((c) =>
                editC === c.id ? (
                  <div className="stack tight item-edit" key={c.id}>
                    <input className="input" inputMode="numeric" value={cAmt} onChange={(e) => setCAmt(digitsOnly(e.target.value))} aria-label="Monto del aporte" />
                    <input className="input" type="date" max={todayISO()} value={cDate} onChange={(e) => setCDate(e.target.value)} aria-label="Fecha del aporte" />
                    <div className="row">
                      <button type="button" className="btn small" disabled={busy} onClick={() => void saveContribution(c.id)}>
                        Guardar
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
              {mine.length > 3 && (
                <button type="button" className="link-btn" onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                  {expanded === g.id ? 'Ver menos' : `Ver los ${mine.length} aportes`}
                </button>
              )}
            </div>
          </section>
        )
      })}
    </main>
  )
}
