import { useToastError } from '../lib/useToastError'
import type { Notify } from './Toast'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { STRENGTH_LABEL, friendlyError, passwordStrength } from '../lib/security'
import { confirmPassword } from '../lib/reauth'
import { supabase } from '../lib/supabase'
import { useAccount } from '../lib/account'
import CreatePassword from './CreatePassword'

/** Cambiar la contraseña (pide la actual) y cerrar sesión en los otros dispositivos */
export default function PasswordCard({ title = false, onToast }: { title?: boolean; onToast: Notify }) {
  const setError = useToastError(onToast)
  const [pw, setPw] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [busy, setBusy] = useState(false)
  const strength = passwordStrength(pw)
  const account = useAccount()

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (strength < 2) {
      setError('Usa al menos 10 caracteres y que no sea tan obvia.')
      return
    }
    setBusy(true)
    setError(null)
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
    onToast('Contraseña actualizada\nUsa la nueva la próxima vez que entres.')
  }

  async function signOutOthers() {
    setError(null)
    const { error: err } = await supabase.auth.signOut({ scope: 'others' })
    if (err) setError(friendlyError(err.message))
    else onToast('Sesiones cerradas\nCerraste sesión en tus **otros dispositivos**.')
  }

  return (
    <>
    <section className="card">
      {title && <strong>Contraseña</strong>}
      {!account.hasPassword ? (
        <CreatePassword reason="Entraste con Google, así que tu cuenta aún no tiene contraseña. Créala para poder confirmar acciones delicadas, como borrar la cuenta o bloquear la app." />
      ) : (
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
      )}
      <button type="button" className="btn ghost small" onClick={() => void signOutOthers()}>
        Cerrar sesión en otros dispositivos
      </button>
      <span className="hint">Úsalo si perdiste el teléfono o entraste desde un equipo ajeno.</span>
    </section>
    </>
  )
}
