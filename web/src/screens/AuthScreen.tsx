import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

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

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg({ text: 'Correo o contraseña incorrectos', error: true })
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMsg({ text: `No se pudo crear la cuenta: ${error.message}`, error: true })
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
        <h1 className="title">Nido</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Inicia sesión para ver las finanzas de los dos.'
            : 'Crea tu cuenta. Tu pareja creará la suya después.'}
        </p>
        <form className="stack" onSubmit={(e) => void submit(e)}>
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
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'register' && <span className="hint">Mínimo 10 caracteres.</span>}
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
