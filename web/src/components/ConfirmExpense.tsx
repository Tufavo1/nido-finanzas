// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import type { FormEvent } from 'react'
import Spin from './Spin'
import { money } from '../lib/format'
import { confirmBlocker } from '../lib/confirmForm'
import { haptic } from '../lib/haptics'
import type { ExpenseDraft } from '../lib/candidates'
import type { Tables } from '../lib/database.types'
import { logError } from '../lib/safeLog'

interface Props {
  /** Borrador ya armado por el módulo de candidatos (monto, comercio, categoría sugerida, compartido) */
  draft: ExpenseDraft
  categories: Pick<Tables<'categories'>, 'id' | 'name'>[]
  members: Pick<Tables<'members'>, 'user_id' | 'display_name'>[]
  /** Guarda el gasto; si falla, lanza el error y la pantalla lo muestra sin perder lo escrito */
  onConfirm: (d: ExpenseDraft) => Promise<void>
  /** Descarta el borrador (el botón atrás lo conserva en la cola) */
  onDiscard: () => void
}

/** «Confirmar gasto»: todo viene precargado; la persona corrige lo que haga falta y toca Confirmar. */
export default function ConfirmExpense({ draft, categories, members, onConfirm, onDiscard }: Props) {
  const [form, setForm] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocker = confirmBlocker({ amount: form.amount, note: form.note, categoryId: form.category_id, paidBy: form.paid_by }, members.map((m) => m.user_id))
  const set = <K extends keyof ExpenseDraft>(k: K, v: ExpenseDraft[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (blocker || busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm(form)
      haptic('success')
    } catch (err) {
      logError(err, 'ConfirmExpense')
      haptic('error')
      setError('No pudimos guardar el gasto. Revisa tu conexión y vuelve a intentarlo: no perdiste nada de lo que escribiste.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen">
      <h1 className="title">Confirmar gasto</h1>
      <p className="muted">Lo detectamos en un aviso de tu banco. Revisa que esté bien y confirma.</p>
      <form className="card stack" onSubmit={(e) => void submit(e)} aria-describedby={error ? 'confirm-error' : undefined}>
        <div className="amount big num" aria-live="polite">
          {money(form.amount)}
        </div>
        <div className="field">
          <label htmlFor="cf-amount">Monto en pesos</label>
          <input id="cf-amount" className="input" inputMode="numeric" autoComplete="off" value={form.amount || ''} onChange={(e) => set('amount', Number(e.target.value.replace(/\D/g, '').slice(0, 9)))} />
        </div>
        <div className="field">
          <label htmlFor="cf-note">Comercio o detalle</label>
          <input id="cf-note" className="input" autoComplete="off" value={form.note} onChange={(e) => set('note', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cf-cat">Categoría</label>
          <select id="cf-cat" className="input" value={form.category_id ?? ''} onChange={(e) => set('category_id', e.target.value || null)}>
            <option value="">Elige una categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {members.length > 1 && (
          <div className="field">
            <label htmlFor="cf-paid">Quién pagó</label>
            <select id="cf-paid" className="input" value={form.paid_by} onChange={(e) => set('paid_by', e.target.value)}>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="row between">
          <span id="cf-shared-label">¿Es un gasto compartido?</span>
          <button type="button" role="switch" className="switch" aria-checked={form.shared} aria-labelledby="cf-shared-label" onClick={() => set('shared', !form.shared)} />
        </div>
        {error && (
          <p id="confirm-error" role="alert" className="error">
            {error}
          </p>
        )}
        {blocker && <span className="line-help">{blocker}</span>}
        <button type="submit" className="btn" disabled={blocker !== null || busy}>
          {busy ? <Spin label="Guardando…" /> : 'Confirmar gasto'}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onDiscard}>
          Ahora no
        </button>
      </form>
    </main>
  )
}
