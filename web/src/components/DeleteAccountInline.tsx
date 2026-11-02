import { useState } from 'react'
import type { FormEvent } from 'react'
import { confirmPassword } from '../lib/reauth'
import { supabase } from '../lib/supabase'
import { useAccount } from '../lib/account'
import CreatePassword from './CreatePassword'

/** Borrar la cuenta cuando no se pertenece a ningún hogar (por ejemplo, después de salir de uno) */
export default function DeleteAccountInline() {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const account = useAccount()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await confirmPassword(pw)
      const { error: err } = await supabase.rpc('delete_account')
      if (err) throw new Error(err.message)
      await supabase.auth.signOut({ scope: 'local' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar la cuenta')
      setBusy(false)
    } finally {
      setPw('')
    }
  }

  if (!open) {
    return (
      <button className="link-btn muted" type="button" onClick={() => setOpen(true)}>
        Borrar mi cuenta
      </button>
    )
  }
  return (
    !account.hasPassword ? (
      <div className="card stack tight danger-zone">
        <CreatePassword reason="Para borrar tu cuenta pedimos una contraseña, y la tuya entra con Google. Créala primero." />
        <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    ) : (
    <form className="card stack tight danger-zone" onSubmit={(e) => void submit(e)}>
      <span className="muted small-text">Se borra tu cuenta para siempre. No se puede deshacer.</span>
      <div className="field">
        <label htmlFor="del-pw">Escribe tu contraseña para confirmar</label>
        <input id="del-pw" className="input" type="password" autoComplete="current-password" required
          value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn danger small grow" disabled={busy || !pw}>
          {busy ? 'Borrando…' : 'Borrar mi cuenta para siempre'}
        </button>
        <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
    )
  )
}
