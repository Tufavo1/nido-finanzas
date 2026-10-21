import { useState } from 'react'
import type { FormEvent } from 'react'
import Logo from '../components/Logo'
import { STRENGTH_LABEL, passwordStrength } from '../lib/security'
import { supabase } from '../lib/supabase'

/** Pantalla que se abre desde el correo de recuperación: elegir la contraseña nueva. */
export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const strength = passwordStrength(pw)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (strength < 2) {
      setError('Usa al menos 10 caracteres y que no sea tan obvia.')
      return
    }
    if (pw !== again) {
      setError('Las dos contraseñas no son iguales. Escríbelas de nuevo.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (err) {
      console.error(err)
      const m = err.message.toLowerCase()
      setError(
        m.includes('different') || m.includes('same')
          ? 'La contraseña nueva debe ser distinta a la anterior.'
          : m.includes('session') || m.includes('expired')
            ? 'El enlace venció. Vuelve a la pantalla de inicio y pide uno nuevo.'
            : 'No se pudo cambiar la contraseña. Intenta de nuevo.',
      )
      return
    }
    onDone()
  }

  return (
    <div className="app">
      <main className="screen center-y plata">
        <div className="auth-hero">
          <Logo size={72} animate />
          <h1 className="title brand-title">Contigo</h1>
        </div>
        <section className="card explain">
          <strong>Crea tu contraseña nueva</strong>
          <p>Escribe la contraseña que quieres usar desde ahora. Después podrás entrar con ella.</p>
        </section>
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="new-pw">Contraseña nueva</label>
            <input
              id="new-pw"
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              maxLength={72}
              minLength={10}
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <div className={strength <= 1 ? 'strength weak' : 'strength'} aria-hidden="true">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className={strength >= i ? 'on' : ''} />
              ))}
            </div>
            <span className="hint" aria-live="polite">
              {pw ? STRENGTH_LABEL[strength] : 'Mínimo 10 caracteres. Mezcla letras, números y símbolos.'}
            </span>
          </div>
          <div className="field">
            <label htmlFor="new-pw2">Escríbela otra vez</label>
            <input
              id="new-pw2"
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              maxLength={72}
              required
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
            <button type="button" className="link-btn" onClick={() => setShow((v) => !v)}>
              {show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar mi contraseña nueva'}
          </button>
        </form>
      </main>
    </div>
  )
}
