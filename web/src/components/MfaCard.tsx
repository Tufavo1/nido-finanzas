import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import type { Notify } from './Toast'

/** Verificación en dos pasos opcional (app de autenticación): activar, y desactivar con un código vigente */
export default function MfaCard({ onToast }: { onToast: Notify }) {
  const setError = useToastError(onToast)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [disabling, setDisabling] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactorId(data?.totp[0]?.id ?? null) // `totp` solo trae los verificados
    setReady(true)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function start() {
    setBusy(true)
    setError(null)
    // Un intento anterior pudo dejar factores sin verificar; chocan con el nombre del nuevo
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of list?.all ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Contigo ${Date.now()}` })
    setBusy(false)
    if (err || !data) return setError('No se pudo activar la verificación en dos pasos. Inténtalo de nuevo.')
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    const id = enroll?.id ?? factorId
    if (!id) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() })
    if (err) {
      setBusy(false)
      return setError('El código no es correcto. Prueba con el que muestra ahora tu app.')
    }
    if (disabling && factorId) {
      const { error: uerr } = await supabase.auth.mfa.unenroll({ factorId })
      setBusy(false)
      if (uerr) return setError('No se pudo desactivar. Inténtalo de nuevo.')
      setDisabling(false)
      setFactorId(null)
      onToast('Verificación desactivada\nYa no pediremos código al entrar.', 'warn')
    } else {
      setBusy(false)
      setEnroll(null)
      onToast('Verificación activada\nDesde ahora te pediremos un código al entrar.')
      await load()
    }
    setCode('')
  }

  const showCode = enroll || disabling
  return (
    <section className="card">
      <strong>Verificación en dos pasos</strong>
      <span className="muted small-text">Además de tu contraseña, pedimos un código de 6 números de una app de autenticación (Google Authenticator, Authy, 1Password…). Protege tu cuenta aunque alguien sepa tu contraseña.</span>
      {ready && !factorId && !enroll && (
        <button type="button" className="btn small" disabled={busy} onClick={() => void start()}>
          Activar la verificación
        </button>
      )}
      {factorId && !disabling && (
        <>
          <span className="strong">Activada</span>
          <button type="button" className="btn ghost small" onClick={() => setDisabling(true)}>
            Desactivar
          </button>
        </>
      )}
      {enroll && (
        <>
          <img src={enroll.qr} alt="Código QR para tu app de autenticación" width={180} height={180} />
          <span className="line-help">Escanéalo con tu app. Si no puedes, escribe esta clave: {enroll.secret}</span>
        </>
      )}
      {showCode && (
        <form className="stack tight" onSubmit={(e) => void confirm(e)}>
          <div className="field">
            <label htmlFor="mfa-card-code">{disabling ? 'Código actual para desactivar' : 'Código de 6 dígitos para confirmar'}</label>
            <input id="mfa-card-code" className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="row">
            <button type="submit" className="btn small grow" disabled={busy || code.length !== 6}>
              {disabling ? 'Desactivar' : 'Confirmar y activar'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => { setDisabling(false); setEnroll(null); setCode('') }}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
