import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Icon from '../components/Icon'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { digitsOnly, memberColor, shortDate } from '../lib/ui'

export default function Goals({ hh, data }: { hh: Household; data: HouseholdData }) {
  const { goals, contributions } = data
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [amt, setAmt] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const members = new Map(hh.members.map((m) => [m.user_id, m] as const))

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
    const { error: err } = await supabase.from('contributions').insert({
      household_id: hh.household.id,
      goal_id: goalId,
      user_id: hh.me.user_id,
      amount: n,
    })
    setBusy(false)
    if (err) {
      setError('No se pudo registrar el aporte')
      return
    }
    setAmt('')
    setOpenId(null)
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
        const pct = Math.min(100, Math.round((saved * 100) / g.target_amount))
        return (
          <section className="card" key={g.id}>
            <div className="row between">
              <strong>{g.name}</strong>
              <span className="muted num">{pct}%</span>
            </div>
            <div className="bar big" aria-hidden="true">
              <span style={{ width: `${pct}%`, background: 'var(--accent)' }} />
            </div>
            <div className="muted num">
              {money(saved)} de {money(g.target_amount)}
              {g.target_date ? ` · para ${shortDate(g.target_date)}` : ''}
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
              {mine.slice(0, 3).map((c) => (
                <div className="item" key={c.id}>
                  <span className="dot" style={{ background: memberColor(members.get(c.user_id)) }} />
                  <div className="grow muted small-text">
                    {members.get(c.user_id)?.display_name ?? ''} · {shortDate(c.contributed_on)}
                  </div>
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
              ))}
            </div>
          </section>
        )
      })}
    </main>
  )
}
