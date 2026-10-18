import { useState } from 'react'
import type { Household } from '../App'
import Icon from '../components/Icon'
import WidgetTokens from '../components/WidgetTokens'
import PushToggle from '../components/PushToggle'
import { supabase } from '../lib/supabase'
import { memberColor } from '../lib/ui'

export default function Security({ hh, reload }: { hh: Household; reload: () => Promise<void> }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const code = hh.household.invite_code
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
      <h1 className="title">Seguridad</h1>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

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
            <span className="muted">Compártelo solo con tu pareja. Deja de servir cuando ella entre.</span>
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
        ) : (
          <span className="muted">El hogar está completo. El código de invitación ya no existe.</span>
        )}
      </section>

      <section className="card">
        <strong>Bloqueo con huella o rostro</strong>
        <span className="muted">Llega en la siguiente fase.</span>
      </section>

      <PushToggle />

      <WidgetTokens />

      <button className="btn danger" type="button" onClick={() => void supabase.auth.signOut()}>
        Cerrar sesión
      </button>
    </main>
  )
}
