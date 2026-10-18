import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { STRENGTH_LABEL, createThrottle, friendlyError, passwordStrength } from '../lib/security'

const throttle = createThrottle()

interface Msg {
  text: string
  error: boolean
}

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [show, setShow] = useState(false)
  const strength = passwordStrength(password)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const wait = throttle.remaining()
    if (wait > 0) {
      setMsg({ text: `Demasiados intentos. Espera ${wait} s y vuelve a probar.`, error: true })
      return
    }
    if (mode === 'register' && strength < 2) {
      setMsg({ text: 'Usa una contraseña de al menos 10 caracteres y no tan obvia.', error: true })
      return
    }
    setBusy(true)
    setMsg(null)
    const cleanEmail = email.trim().toLowerCase()
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      if (error) {
        throttle.fail()
        setMsg({ text: 'Correo o contraseña incorrectos', error: true })
      } else {
        throttle.reset()
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password })
      if (error) {
        setMsg({ text: friendlyError(error.message), error: true })
      } else if (!data.session) {
        setMsg({
          text: 'Te enviamos un correo para confirmar la cuenta. Confírmala y vuelve a iniciar sesión.',
          error: false,
        })
      }
    }
    setBusy(false)
  }

  return (
    <div className="app">
      <main className="screen center-y">
        <div className="logo" aria-hidden="true" />
        <h1 className="title">Contigo</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Inicia sesión para ver las finanzas de los dos.'
            : 'Crea tu cuenta. Tu pareja creará la suya después.'}
        </p>
        <form className="stack" noValidate={false} onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={72}
              required
              minLength={mode === 'register' ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="link-btn" onClick={() => setShow((v) => !v)}>
              {show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            </button>
            {mode === 'register' && (
              <>
                <div className={strength <= 1 ? 'strength weak' : 'strength'} aria-hidden="true">
                  {[1, 2, 3, 4].map((i) => (
                    <span key={i} className={strength >= i ? 'on' : ''} />
                  ))}
                </div>
                <span className="hint" aria-live="polite">
                  {password ? STRENGTH_LABEL[strength] : 'Mínimo 10 caracteres. Mezcla letras, números y símbolos.'}
                </span>
              </>
            )}
          </div>
          {msg && (
            <p className={msg.error ? 'error' : 'notice'} role="alert">
              {msg.text}
            </p>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setMsg(null)
          }}
        >
          {mode === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
        </button>
      </main>
    </div>
  )
}
