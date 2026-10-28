import { useToastError } from '../lib/useToastError'
import type { Notify } from './Toast'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import { confirmPassword } from '../lib/reauth'
import { supabase } from '../lib/supabase'

type Action = 'leave' | 'delete'

/** Salir del hogar o borrar la cuenta. Siempre pide la contraseña. */
export default function LeaveAccount({ hh, reload, onToast }: { hh: Household; reload: () => Promise<void>; onToast: Notify }) {
  const [action, setAction] = useState<Action | null>(null)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)
  const partner = hh.members.find((m) => m.user_id !== hh.me.user_id)

  const explain: Record<Action, string> = partner
    ? {
        leave: `Dejarás de ver este hogar. Tu sueldo, tus ingresos, tu perfil, tus deudas personales y los widgets que creaste se borran. Los gastos que compartieron quedan en el historial de ${partner.display_name}, con tu nombre. Después podrás crear tu propio hogar o unirte a otro.`,
        delete: `Sales del hogar (como arriba) y se borra tu cuenta para siempre. Los gastos compartidos quedan en el historial de ${partner.display_name}. No se puede deshacer.`,
      }
    : {
        leave: 'Como eres la única persona del hogar, se borra el hogar completo: gastos, metas, deudas, sueldo y todo lo demás. No se puede deshacer.',
        delete: 'Se borra el hogar completo con todos sus datos y también tu cuenta. No se puede deshacer.',
      }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!action) return
    setBusy(true)
    setError(null)
    try {
      await confirmPassword(pw)
      const { error: err } = await supabase.rpc(action === 'leave' ? 'leave_household' : 'delete_account')
      if (err) throw new Error(err.message)
      if (action === 'delete') {
        // La cuenta ya no existe: solo queda limpiar este dispositivo
        await supabase.auth.signOut({ scope: 'local' })
      } else {
        onToast(partner ? 'Saliste del hogar\nYa no ves sus datos.' : 'Hogar borrado\nSe eliminaron todos sus datos.', 'info')
        await reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal. Inténtalo de nuevo.')
      setBusy(false)
    } finally {
      setPw('')
    }
  }

  return (
    <section className="card danger-zone" aria-label="Salir o borrar cuenta">
      <strong>Salir o borrar cuenta</strong>
      {action === null ? (
        <>
          <button type="button" className="btn ghost small" onClick={() => setAction('leave')}>
            {partner ? 'Salir de este hogar' : 'Borrar mi hogar'}
          </button>
          <button type="button" className="btn danger small" onClick={() => setAction('delete')}>
            Borrar mi cuenta
          </button>
        </>
      ) : (
        <form className="stack tight" onSubmit={(e) => void submit(e)}>
          <span className="muted small-text">{explain[action]}</span>
          <div className="field">
            <label htmlFor="danger-pw">Escribe tu contraseña para confirmar</label>
            <input id="danger-pw" className="input" type="password" autoComplete="current-password" required
              value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="row">
            <button type="submit" className="btn danger small grow" disabled={busy || !pw}>
              {busy
                ? 'Procesando…'
                : action === 'delete'
                  ? 'Borrar mi cuenta para siempre'
                  : partner
                    ? 'Salir del hogar'
                    : 'Borrar el hogar'}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setAction(null)
                setError(null)
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
