import { useState } from 'react'
import type { FormEvent } from 'react'
import Logo from '../components/Logo'
import Spin from '../components/Spin'
import { STRENGTH_LABEL, friendlyError, passwordStrength } from '../lib/security'
import { supabase } from '../lib/supabase'

/**
 * Paso 1 de 2 para quien entra con Google: crear su contraseña. Se pide para confirmar acciones delicadas
 * (desbloquear la app, borrar la cuenta, salir del hogar). Después viene crear el hogar.
 */
export default function SetupPassword({ name }: { name?: string }) {
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const strength = passwordStrength(pw)
  const mismatch = again !== '' && again !== pw

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (strength < 2) return setError('Usa al menos 10 caracteres, con letras y números, y que no sea tan obvia.')
    if (pw !== again) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password: pw, data: { has_password: true } })
    if (err) {
      setError(friendlyError(err.message))
      setBusy(false)
    }
    // Si sale bien, la sesión se actualiza y App pasa sola al paso 2
  }

  return (
    <div className="app">
      <main className="screen auth-screen">
        <div className="auth-hero">
          <Logo size={56} />
          <span className="eyebrow">Paso 1 de 2</span>
          <h1 className="title">{name ? `Hola, ${name}` : 'Crea tu contraseña'}</h1>
          {name && <p className="auth-sub">Crea tu contraseña</p>}
        </div>
        <p className="muted">La usarás para confirmar acciones delicadas, como desbloquear la app o borrar tu cuenta. Entrarás siempre con Google si quieres.</p>
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="sp-pw">Contraseña</label>
            <input id="sp-pw" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={72} required value={pw} onChange={(e) => setPw(e.target.value)} />
            {pw ? (
              <>
                <div className={strength <= 1 ? 'strength weak' : 'strength'} aria-hidden="true">
                  {[1, 2, 3, 4].map((i) => (
                    <span key={i} className={strength >= i ? 'on' : ''} />
                  ))}
                </div>
                <span className="hint" aria-live="polite">{STRENGTH_LABEL[strength]}</span>
              </>
            ) : (
              <span className="hint">Mínimo 10 caracteres. Mezcla letras, números y símbolos.</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="sp-again">Confirma tu contraseña</label>
            <input id="sp-again" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" maxLength={72} required aria-invalid={mismatch} aria-describedby="sp-match" value={again} onChange={(e) => setAgain(e.target.value)} />
            <span id="sp-match" className={mismatch ? 'hint error-text' : 'hint'} aria-live="polite">
              {mismatch ? 'No coinciden todavía.' : again && again === pw ? 'Coinciden.' : ''}
            </span>
            <button type="button" className="link-btn" onClick={() => setShow((v) => !v)}>
              {show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={busy || !pw || !again}>
            {busy ? <Spin label="Guardando…" /> : 'Continuar'}
          </button>
        </form>
        <button className="link-btn" type="button" onClick={() => void supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </main>
    </div>
  )
}
