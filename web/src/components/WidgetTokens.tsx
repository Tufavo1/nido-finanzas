import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Icon from './Icon'
import { supabase } from '../lib/supabase'

interface TokenRow {
  id: string
  label: string
  created_at: string
}

export default function WidgetTokens() {
  const [rows, setRows] = useState<TokenRow[]>([])
  const [label, setLabel] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('widget_tokens')
      .select('id, label, created_at')
      .order('created_at')
    if (err) {
      setError('No se pudieron cargar los widgets')
      return
    }
    setRows(data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('create_widget_token', { p_label: label })
    setBusy(false)
    if (err || !data) {
      setError(err?.message ?? 'No se pudo crear el token')
      return
    }
    setFresh(data)
    setCopied(false)
    setLabel('')
    await load()
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError('No se pudo copiar. Selecciona el texto y cópialo a mano.')
    }
  }

  async function revoke(id: string) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setError(null)
    const { error: err } = await supabase.from('widget_tokens').delete().eq('id', id)
    setConfirmId(null)
    if (err) {
      setError('No se pudo revocar el widget')
      return
    }
    await load()
  }

  return (
    <section className="card">
      <strong>Widgets</strong>
      <span className="muted">
        Cada widget usa su propio token de solo lectura: ve únicamente totales, nunca el detalle de los gastos.
        Si pierdes un teléfono, revoca su token.
      </span>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {fresh && (
        <div className="stack tight">
          <span className="notice">Guárdalo ahora: no se vuelve a mostrar.</span>
          <div className="token-box">{fresh}</div>
          <div className="row">
            <button type="button" className="btn small" onClick={() => void copy(fresh)}>
              {copied ? 'Copiado' : 'Copiar token'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setFresh(null)}>
              Ya lo guardé
            </button>
          </div>
        </div>
      )}

      <div>
        {rows.map((r) => (
          <div className="item" key={r.id}>
            <div className="grow">
              <div className="ellipsis">{r.label}</div>
              <div className="muted small-text">{r.created_at.slice(0, 10)}</div>
            </div>
            <button
              type="button"
              className={confirmId === r.id ? 'icon-btn confirm' : 'icon-btn'}
              aria-label={confirmId === r.id ? 'Confirmar revocación' : `Revocar ${r.label}`}
              onClick={() => void revoke(r.id)}
            >
              {confirmId === r.id ? <strong>¿Revocar?</strong> : <Icon name="trash" size={20} />}
            </button>
          </div>
        ))}
        {rows.length === 0 && <span className="muted">Aún no hay widgets.</span>}
      </div>

      <form className="row" onSubmit={(e) => void create(e)}>
        <input
          className="input"
          placeholder="Nombre (ej. iPhone)"
          maxLength={40}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Nombre del widget"
        />
        <button className="btn small" type="submit" disabled={busy || !label.trim()}>
          Crear
        </button>
      </form>
    </section>
  )
}