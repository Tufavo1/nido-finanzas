import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Logo from '../components/Logo'
import Spin from '../components/Spin'
import { createThrottle } from '../lib/security'
import { supabase } from '../lib/supabase'

const throttle = createThrottle(5, 30000, 'contigo-mfa-throttle')

/** Quien activó la verificación en dos pasos escribe aquí el código de su app antes de entrar */
export default function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => setFactorId(data?.totp[0]?.id ?? null))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    const wait = throttle.remaining()
    if (wait > 0) return setError(`Demasiados intentos. Espera ${wait} s.`)
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    if (err) {
      throttle.fail()
      setError('El código no es correcto o ya venció. Usa el que muestra ahora tu app de verificación.')
      setBusy(false)
      return
    }
    throttle.reset()
    onVerified()
  }

  return (
    <div className="app">
      <main className="screen center-y auth-screen">
        <div className="auth-hero">
          <Logo size={56} />
          <h1 className="title">Verificación en dos pasos</h1>
        </div>
        <p className="muted">Escribe el código de 6 números que muestra tu app de verificación.</p>
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="mfa-login-code">Código de 6 dígitos</label>
            <input id="mfa-login-code" className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={busy || code.length !== 6 || !factorId}>
            {busy ? <Spin label="Verificando…" /> : 'Entrar'}
          </button>
        </form>
        <button className="link-btn" type="button" onClick={() => void supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </main>
    </div>
  )
}
