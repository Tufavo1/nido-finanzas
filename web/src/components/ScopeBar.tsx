import type { Household } from '../App'
import type { Scope } from '../lib/scope'

/** Elige de quién se ven los datos: del hogar entero, tuyos o de tu pareja. Es el mismo en todas las pestañas. A solas solo están Hogar y Yo. */
export default function ScopeBar({ hh, scope, onScope, label = 'Ver los datos de' }: { hh: Household; scope: Scope; onScope: (s: Scope) => void; label?: string }) {
  const mine = hh.members.find((m) => m.user_id === hh.me.user_id) ?? hh.me
  const partner = hh.members.find((m) => m.user_id !== hh.me.user_id)
  return (
    <div className="seg" role="group" aria-label={label}>
      <button type="button" aria-pressed={scope === 'all'} onClick={() => onScope('all')}>
        Hogar
      </button>
      {[mine, ...(partner ? [partner] : [])].map((m) => (
        <button key={m.user_id} type="button" aria-pressed={scope === m.user_id} onClick={() => onScope(m.user_id)}>
          {m.user_id === hh.me.user_id ? 'Yo' : m.display_name}
        </button>
      ))}
    </div>
  )
}
