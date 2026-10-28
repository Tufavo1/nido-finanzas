import { useToastError } from '../lib/useToastError'
import type { Notify } from './Toast'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { friendlyError } from '../lib/security'
import { confirmPassword } from '../lib/reauth'
import { supabase } from '../lib/supabase'
import Spin from './Spin'

/** El correo de la cuenta y cómo cambiarlo: pide la contraseña y confirma desde el correo nuevo */
export default function EmailCard({ onToast }: { onToast: Notify }) {
  const [current, setCurrent] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrent(data.user?.email ?? null))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return setError('Escribe un correo válido')
    if (next === current?.toLowerCase()) return setError('Ese ya es tu correo actual')
    setBusy(true)
    setError(null)
    try {
      // Con una sesión robada no se puede cambiar el correo sin conocer la contraseña
      await confirmPassword(password)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Contraseña incorrecta')
      return
    }
    const { error: err } = await supabase.auth.updateUser({ email: next })
    setBusy(false)
    if (err) {
      setError(friendlyError(err.message))
      return
    }
    setEditing(false)
    setEmail('')
    setPassword('')
    onToast(`Revisa tu correo\nTe enviamos una confirmación a **${next}**. Tu correo cambia cuando la abras.`, 'info')
  }

  return (
    <section className="card">
      <strong>Correo de la cuenta</strong>
      <div className="row between">
        <span className="muted small-text">Con este correo entras a Contigo</span>
        {!editing && (
          <button type="button" className="btn ghost small" onClick={() => setEditing(true)}>
            Cambiar
          </button>
        )}
      </div>
      <span className="strong">{current ?? 'Cargando…'}</span>
      {editing && (
        <form className="stack tight" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="new-email">Correo nuevo</label>
            <input id="new-email" className="input" type="email" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email-pw">Tu contraseña</label>
            <input id="email-pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="hint">La pedimos para confirmar que eres tú.</span>
          </div>
          <div className="row">
            <button className="btn small" type="submit" disabled={busy || !email || !password}>
              {busy ? <Spin label="Enviando…" /> : 'Cambiar correo'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
