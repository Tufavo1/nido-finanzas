import { useToastError } from '../lib/useToastError'
import type { Notify } from './Toast'
import type { Household } from '../App'
import Avatar from './Avatar'
import Icon from './Icon'
import { supabase } from '../lib/supabase'

/** El hogar completo: quiénes lo forman y la invitación para sumar a la pareja */
export default function HomeCard({ hh, reload, onToast }: { hh: Household; reload: () => Promise<void>; onToast: Notify }) {
  const setError = useToastError(onToast)
  const expires = hh.household.invite_expires_at
  const expired = !expires || new Date(expires) <= new Date()
  const code = expired ? null : hh.household.invite_code
  const incomplete = hh.members.length < 2

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      onToast('Código copiado\nCompártelo solo con tu pareja.')
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
    onToast('Código nuevo listo\nEl anterior **ya no sirve**.')
    await reload()
  }

  return (
    <>
    <section className="card">
      <strong>{hh.household.name}</strong>
      {hh.members.map((m) => (
        <div className="row" key={m.user_id}>
          <Avatar name={m.display_name} color={m.color} />
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
    </>
  )
}
