import { useState } from 'react'
import type { FormEvent } from 'react'
import InstallBanner from '../components/InstallBanner'
import Logo from '../components/Logo'
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, copyright } from '../lib/about'
import { captchaToken } from '../lib/captcha'
import { NEEDS } from '../lib/needs'
import { supabase } from '../lib/supabase'
import { STRENGTH_LABEL, createThrottle, friendlyError, passwordStrength } from '../lib/security'
import Spin from '../components/Spin'
import LegalModal from '../components/LegalModal'
import { LEGAL_VERSION } from '../lib/legal'

const throttle = createThrottle()

interface Msg {
  text: string
  error: boolean
}

export default function AuthScreen({ notice }: { notice?: string | null }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(notice ? { text: notice, error: true } : null)
  const [show, setShow] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [legal, setLegal] = useState<'privacy' | 'terms' | null>(null)
  const strength = passwordStrength(password)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const wait = throttle.remaining()
    if (wait > 0) {
      setMsg({ text: `Demasiados intentos. Espera ${wait} s y vuelve a probar.`, error: true })
      return
    }
    if (mode === 'register' && strength < 2) {
      setMsg({ text: 'Usa una contraseña de al menos 10 caracteres, con letras y números, y no tan obvia.', error: true })
      return
    }
    if (mode === 'register' && !accepted) {
      setMsg({ text: 'Para crear tu cuenta, marca la casilla que acepta los términos y la política de privacidad.', error: true })
      return
    }
    setBusy(true)
    setMsg(null)
    const cleanEmail = email.trim().toLowerCase()
    let captcha: string | undefined
    try {
      captcha = await captchaToken()
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo verificar que no eres un robot', error: true })
      setBusy(false)
      return
    }
    if (mode === 'forgot') {
      throttle.fail()
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
        captchaToken: captcha,
      })
      // Mismo mensaje exista o no la cuenta, para no revelar quién está registrado
      if (error && /rate|too many|seconds/i.test(error.message)) {
        setMsg({ text: 'Ya te enviamos un correo hace poco. Espera un minuto y vuelve a pedirlo.', error: true })
      } else {
        if (error) console.error(error)
        setMsg({
          text: 'Listo. Si ese correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.',
          error: false,
        })
      }
    } else if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
        options: { captchaToken: captcha },
      })
      if (error) {
        throttle.fail()
        setMsg({ text: 'Correo o contraseña incorrectos', error: true })
      } else {
        throttle.reset()
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { captchaToken: captcha, data: { accepted_terms_at: new Date().toISOString(), terms_version: LEGAL_VERSION } },
      })
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
        <div className="auth-hero">
          <Logo size={72} animate />
          <h1 className="title brand-title">Contigo</h1>
          <p className="tagline">Tus finanzas, contigo.</p>
        </div>
        <p className="muted">
          {mode === 'login'
            ? 'Inicia sesión para ver las finanzas de los dos.'
            : mode === 'register'
              ? 'Crea tu cuenta. Tu pareja creará la suya después.'
              : 'Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.'}
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
          {mode !== 'forgot' && (
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
          )}
          {mode === 'register' && (
            <label className="accept">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>
                Acepto los{' '}
                <button type="button" className="link-btn" onClick={() => setLegal('terms')}>
                  términos y condiciones
                </button>{' '}
                y la{' '}
                <button type="button" className="link-btn" onClick={() => setLegal('privacy')}>
                  política de privacidad
                </button>
                .
              </span>
            </label>
          )}
          {msg && (
            <p className={msg.error ? 'error' : 'notice'} role="alert">
              {msg.text}
            </p>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? <Spin label={mode === 'login' ? 'Entrando…' : mode === 'register' ? 'Creando tu cuenta…' : 'Enviando…'} /> : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviarme el enlace'}
          </button>
        </form>
        {mode === 'login' && (
          <button
            className="link-btn"
            type="button"
            onClick={() => {
              setMode('forgot')
              setMsg(null)
            }}
          >
            Olvidé mi contraseña
          </button>
        )}
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setMsg(null)
          }}
        >
          {mode === 'login' ? 'Crear una cuenta' : mode === 'register' ? 'Ya tengo cuenta' : 'Volver a iniciar sesión'}
        </button>
        <details className="auth-needs">
          <summary>¿Qué necesito para usar Contigo?</summary>
          <ul>
            {NEEDS.map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong> ({n.required ? 'necesario' : 'opcional'}): {n.why}
              </li>
            ))}
          </ul>
        </details>
        <footer className="auth-foot">
          <div className="legal-links">
            <button type="button" className="link-btn" onClick={() => setLegal('terms')}>
              Términos y condiciones
            </button>
            <button type="button" className="link-btn" onClick={() => setLegal('privacy')}>
              Política de privacidad
            </button>
          </div>
          <span>{copyright()}</span>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
            Síguenos en Instagram {INSTAGRAM_HANDLE}
          </a>
        </footer>
      </main>
      <InstallBanner onAuth />
      {legal && <LegalModal doc={legal} onClose={() => setLegal(null)} />}
    </div>
  )
}
