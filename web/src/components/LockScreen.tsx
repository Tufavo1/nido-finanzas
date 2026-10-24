import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { confirmPassword } from '../lib/reauth'
import { supabase } from '../lib/supabase'
import { createThrottle } from '../lib/security'
import Logo from './Logo'

const throttle = createThrottle()

/** Pantalla que tapa la app mientras está bloqueada. Para entrar hay que escribir la contraseña de la cuenta. */
export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const wait = throttle.remaining()
    if (wait > 0) {
      setError(`Demasiados intentos. Espera ${wait} s.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await confirmPassword(pw)
      throttle.reset()
      setPw('')
      onUnlock()
    } catch (err) {
      throttle.fail()
      setError(err instanceof Error ? err.message : 'No se pudo verificar')
    }
    setBusy(false)
  }

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <form className="lock-card" onSubmit={(e) => void submit(e)}>
        <Logo size={48} />
        <h1 id="lock-title" className="title">Contigo está bloqueada</h1>
        <p className="muted">Por tu seguridad, la app se bloqueó tras un rato sin usarla. Escribe tu contraseña para seguir.</p>
        <div className="field">
          <label htmlFor="lock-pw">Contraseña de tu cuenta</label>
          <input
            id="lock-pw"
            ref={input}
            className="input"
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || !pw}>
          {busy ? 'Verificando…' : 'Desbloquear'}
        </button>
        <button type="button" className="link-btn" onClick={() => void supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}
