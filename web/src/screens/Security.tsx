import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import Icon from '../components/Icon'
import LeaveAccount from '../components/LeaveAccount'
import WidgetTokens from '../components/WidgetTokens'
import PushToggle from '../components/PushToggle'
import ProfileCard from '../components/ProfileCard'
import SmartAlertsSetting from '../components/SmartAlertsSetting'
import ThemeToggle from '../components/ThemeToggle'
import type { HouseholdData } from '../lib/data'
import { STRENGTH_LABEL, friendlyError, passwordStrength } from '../lib/security'
import { confirmPassword } from '../lib/reauth'
import { supabase } from '../lib/supabase'
import { memberColor } from '../lib/ui'

export default function Security({
  hh,
  reload,
  data,
  onToast,
}: {
  hh: Household
  reload: () => Promise<void>
  data: HouseholdData
  onToast: (text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [busy, setBusy] = useState(false)
  const strength = passwordStrength(pw)
  const expires = hh.household.invite_expires_at
  const expired = !expires || new Date(expires) <= new Date()
  const code = expired ? null : hh.household.invite_code
  const incomplete = hh.members.length < 2

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar. Selecciona el código y cópialo a mano.')
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (strength < 2) {
      setError('Usa al menos 10 caracteres y que no sea tan obvia.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      // Con una sesión robada no se puede cambiar la contraseña sin conocer la actual
      await confirmPassword(currentPw)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Contraseña actual incorrecta')
      return
    }
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (err) {
      setError(friendlyError(err.message))
      return
    }
    setPw('')
    setCurrentPw('')
    setNotice('Contraseña actualizada.')
  }

  async function signOutOthers() {
    setError(null)
    setNotice(null)
    const { error: err } = await supabase.auth.signOut({ scope: 'others' })
    if (err) setError(friendlyError(err.message))
    else setNotice('Cerraste sesión en tus otros dispositivos.')
  }

  async function rotate() {
    setError(null)
    const { error: err } = await supabase.rpc('rotate_invite_code')
    if (err) {
      setError(err.message)
      return
    }
    await reload()
  }

  return (
    <main className="screen">
      <h1 className="title">Ajustes y seguridad</h1>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <ProfileCard hh={hh} data={data} reload={reload} onToast={onToast} />

      <section className="card">
        <strong>{hh.household.name}</strong>
        {hh.members.map((m) => (
          <div className="row" key={m.user_id}>
            <span className="dot" style={{ background: memberColor(m) }} />
            <span className="grow">
              {m.display_name}
              {m.user_id === hh.me.user_id ? ' (tú)' : ''}
            </span>
          </div>
        ))}
      </section>

      <section className="card">
        <strong>Invitación</strong>
        {incomplete && code ? (
          <>
            <span className="muted">
              Compártelo solo con tu pareja. Sirve una vez y vence el {new Date(expires ?? '').toLocaleDateString('es-CL')}.
            </span>
            <div className="row between">
              <span className="code">{code}</span>
              <button type="button" className="icon-btn" aria-label="Copiar código" onClick={() => void copy(code)}>
                <Icon name="copy" size={20} />
              </button>
            </div>
            {copied && <span className="notice">Copiado</span>}
            <button type="button" className="btn ghost small" onClick={() => void rotate()}>
              Generar código nuevo
            </button>
          </>
        ) : incomplete ? (
          <>
            <span className="muted">
              {hh.household.invite_code ? 'El código venció. ' : ''}Si quieres sumar a tu pareja, genera un código y
              compártelo con ella o él. Un hogar es de 1 o 2 personas.
            </span>
            <button type="button" className="btn ghost small" onClick={() => void rotate()}>
              Generar código de invitación
            </button>
          </>
        ) : (
          <span className="muted">El hogar está completo (2 de 2). Nadie más puede unirse.</span>
        )}
      </section>

      <ThemeToggle />

      <section className="card">
        <strong>Cuenta y contraseña</strong>
        <form className="stack tight" onSubmit={(e) => void changePassword(e)}>
          <div className="field">
            <label htmlFor="curpw">Contraseña actual</label>
            <input
              id="curpw"
              className="input"
              type="password"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="newpw">Nueva contraseña</label>
            <input
              id="newpw"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={72}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          {pw && (
            <>
              <div className={strength <= 1 ? 'strength weak' : 'strength'} aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={strength >= i ? 'on' : ''} />
                ))}
              </div>
              <span className="hint" aria-live="polite">
                {STRENGTH_LABEL[strength]}
              </span>
            </>
          )}
          <button className="btn ghost small" type="submit" disabled={busy || !pw || !currentPw}>
            Cambiar contraseña
          </button>
        </form>
        <button type="button" className="btn ghost small" onClick={() => void signOutOthers()}>
          Cerrar sesión en otros dispositivos
        </button>
        <span className="hint">Úsalo si perdiste el teléfono o entraste desde un equipo ajeno.</span>
      </section>

      <PushToggle />

      <SmartAlertsSetting />

      <WidgetTokens />

      <LeaveAccount hh={hh} reload={reload} />

      <button className="btn danger" type="button" onClick={() => void supabase.auth.signOut()}>
        Cerrar sesión
      </button>
    </main>
  )
}
