import { useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Icon from '../components/Icon'
import { money, todayISO } from '../lib/format'
import { supabase } from '../lib/supabase'
import { digitsOnly, memberColor, shortDate } from '../lib/ui'

export default function Expenses({
  hh,
  data,
  onToast,
}: {
  hh: Household
  data: HouseholdData
  onToast: (text: string) => void
}) {
  const [who, setWho] = useState<string>('all')
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
      .update({ monthly_budget: Number(value || '0'), name: nameValue.trim() || undefined })
      .eq('id', id)
    setBusy(false)
    if (err) {
      setError('No se pudo guardar el presupuesto')
      return
    }
    setEditing(null)
    onToast('Categoría actualizada')
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
    onToast('Categoría quitada (los gastos se conservan)')
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
    onToast('Categoría creada')
    await data.refresh()
  }

  function startEdit(e: HouseholdData['expenses'][number]) {
    setEditExp(e.id)
    setEAmount(String(e.amount))
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
    onToast('Gasto actualizado')
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
    onToast('Gasto borrado')
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
                    aria-label={`Editar categoría ${c.name}`}
                    onClick={() => {
                      setEditing(c.id)
                      setValue(String(c.monthly_budget))
                      setNameValue(c.name)
                      setArchiveId(null)
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
                <div className="stack tight">
                  <input
                    className="input"
                    maxLength={40}
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    aria-label="Nombre de la categoría"
                  />
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
                  <button type="button" className="btn danger small" disabled={busy} onClick={() => void archiveCategory(c.id)}>
                    {archiveId === c.id ? '¿Seguro? Se conservan sus gastos' : 'Quitar categoría'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {newCat ? (
          <div className="stack tight">
            <input className="input" maxLength={40} placeholder="Nombre de la categoría" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nombre de la nueva categoría" />
            <input className="input" inputMode="numeric" placeholder="Presupuesto mensual (opcional)" value={newBudget} onChange={(e) => setNewBudget(digitsOnly(e.target.value))} aria-label="Presupuesto mensual" />
            <div className="row">
              <button type="button" className="btn small" disabled={busy} onClick={() => void addCategory()}>
                Crear
              </button>
              <button type="button" className="btn ghost small" onClick={() => setNewCat(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn ghost small" onClick={() => setNewCat(true)}>
            Nueva categoría
          </button>
        )}
      </section>

      <section className="card">
        <strong>Movimientos del mes</strong>
        <span className="muted small-text">Toca un gasto para corregirlo.</span>
        {list.length === 0 && <span className="muted">Sin gastos para mostrar.</span>}
        <div>
          {list.map((e) =>
            editExp === e.id ? (
              <div className="stack tight item-edit" key={e.id}>
                <input
                  className="input"
                  inputMode="numeric"
                  value={eAmount}
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
                  <button type="button" className="btn small" disabled={busy} onClick={() => void saveEdit(e.id)}>
                    Guardar
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setEditExp(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="item" key={e.id}>
                <span className="dot" style={{ background: memberColor(members.get(e.paid_by)) }} />
                <button
                  type="button"
                  className="item-main grow"
                  aria-label={`Editar gasto ${e.note || catName.get(e.category_id) || ''}`}
                  onClick={() => startEdit(e)}
                >
                  <div className="ellipsis">{e.note || catName.get(e.category_id) || 'Gasto'}</div>
                  <div className="muted small-text">
                    {catName.get(e.category_id) ?? 'Sin categoría'} · {shortDate(e.spent_on)}
                    {e.shared ? '' : ' · personal'}
                  </div>
                </button>
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
            ),
          )}
        </div>
      </section>
    </main>
  )
}
