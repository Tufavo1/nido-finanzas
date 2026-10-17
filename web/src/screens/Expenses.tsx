import { useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Icon from '../components/Icon'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { digitsOnly, memberColor, shortDate } from '../lib/ui'

export default function Expenses({ hh, data }: { hh: Household; data: HouseholdData }) {
  const [who, setWho] = useState<string>('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const members = new Map(hh.members.map((m) => [m.user_id, m] as const))
  const catName = new Map(data.categories.map((c) => [c.id, c.name] as const))
  const list = data.expenses.filter((e) => who === 'all' || e.paid_by === who)

  const spent = new Map<string, number>()
  for (const e of list) spent.set(e.category_id, (spent.get(e.category_id) ?? 0) + e.amount)

  async function saveBudget(id: string) {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from('categories')
      .update({ monthly_budget: Number(value || '0') })
      .eq('id', id)
    setBusy(false)
    if (err) {
      setError('No se pudo guardar el presupuesto')
      return
    }
    setEditing(null)
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
    await data.refresh()
  }

  return (
    <main className="screen">
      <h1 className="title">Gastos</h1>

      <div className="seg" role="group" aria-label="Filtrar por quién pagó">
        <button type="button" aria-pressed={who === 'all'} onClick={() => setWho('all')}>
          Todo
        </button>
        {hh.members.map((m) => (
          <button key={m.user_id} type="button" aria-pressed={who === m.user_id} onClick={() => setWho(m.user_id)}>
            {m.display_name}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <strong>Presupuesto por categoría</strong>
        {data.categories.map((c) => {
          const s = spent.get(c.id) ?? 0
          const over = c.monthly_budget > 0 && s > c.monthly_budget
          const pct = c.monthly_budget > 0 ? Math.min(100, (s * 100) / c.monthly_budget) : 0
          return (
            <div key={c.id} className="stack tight">
              <div className="row between">
                <span>{c.name}</span>
                {editing !== c.id && (
                  <button
                    type="button"
                    className="link-btn num"
                    onClick={() => {
                      setEditing(c.id)
                      setValue(String(c.monthly_budget))
                    }}
                  >
                    <span className={over ? 'over' : ''}>{money(s)}</span> /{' '}
                    {c.monthly_budget > 0 ? money(c.monthly_budget) : 'definir'}
                  </button>
                )}
              </div>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${pct}%`, background: over ? 'var(--warn)' : 'var(--accent)' }} />
              </div>
              {editing === c.id && (
                <div className="row">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={value}
                    onChange={(e) => setValue(digitsOnly(e.target.value))}
                    aria-label={`Presupuesto mensual de ${c.name}`}
                  />
                  <button type="button" className="btn small" disabled={busy} onClick={() => void saveBudget(c.id)}>
                    Guardar
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="card">
        <strong>Movimientos del mes</strong>
        {list.length === 0 && <span className="muted">Sin gastos para mostrar.</span>}
        <div>
          {list.map((e) => (
            <div className="item" key={e.id}>
              <span className="dot" style={{ background: memberColor(members.get(e.paid_by)) }} />
              <div className="grow">
                <div className="ellipsis">{e.note || catName.get(e.category_id) || 'Gasto'}</div>
                <div className="muted small-text">
                  {catName.get(e.category_id)} · {shortDate(e.spent_on)}
                  {e.shared ? '' : ' · personal'}
                </div>
              </div>
              <span className="num">{money(e.amount)}</span>
              <button
                type="button"
                className={confirmId === e.id ? 'icon-btn confirm' : 'icon-btn'}
                aria-label={confirmId === e.id ? 'Confirmar borrado' : 'Borrar gasto'}
                onClick={() => void remove(e.id)}
              >
                {confirmId === e.id ? <strong>¿Seguro?</strong> : <Icon name="trash" size={20} />}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
