import { useState } from 'react'
import type { FormEvent } from 'react'
import { STRENGTH_LABEL, friendlyError, passwordStrength } from '../lib/security'
import { supabase } from '../lib/supabase'

/**
 * Quien entró con Google no tiene contraseña. Las acciones delicadas (desbloquear, borrar la cuenta, salir del hogar,
 * cambiar el correo) piden una, así que aquí puede crearla. Se anota en `has_password`.
 */
export default function CreatePassword({ reason, onDone }: { reason: string; onDone?: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const strength = passwordStrength(pw)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (strength < 2) return setError('Usa al menos 10 caracteres y que no sea tan obvia.')
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password: pw, data: { has_password: true } })
    setBusy(false)
    if (err) return setError(friendlyError(err.message))
    setPw('')
    setDone(true)
    onDone?.()
  }

  if (done) return <p className="hint" role="status">Listo, ya tienes contraseña.</p>
  return (
    <form className="stack tight" onSubmit={(e) => void submit(e)}>
      <span className="muted small-text">{reason}</span>
      <div className="field">
        <label htmlFor="create-pw">Crea una contraseña</label>
        <input id="create-pw" className="input" type="password" autoComplete="new-password" minLength={10} maxLength={72} value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      {pw && (
        <>
          <div className={strength <= 1 ? 'strength weak' : 'strength'} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={strength >= i ? 'on' : ''} />
            ))}
          </div>
          <span className="hint" aria-live="polite">{STRENGTH_LABEL[strength]}</span>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn small" type="submit" disabled={busy || !pw}>
        {busy ? 'Guardando…' : 'Crear contraseña'}
      </button>
    </form>
  )
}
