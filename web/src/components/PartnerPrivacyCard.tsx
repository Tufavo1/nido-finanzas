import { useState } from 'react'
import type { Household } from '../App'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import type { Notify } from './Toast'

type Key = 'share_debts' | 'share_fixed' | 'share_personal' | 'share_savings'

const TOPICS: { key: Key; title: string; hint: string }[] = [
  { key: 'share_debts', title: 'Mis deudas', hint: 'Las deudas donde figuras como titular y sus pagos. Las deudas "de los dos" se ven siempre.' },
  { key: 'share_fixed', title: 'Mis gastos fijos personales', hint: 'Los que son solo tuyos. Los fijos compartidos se ven siempre.' },
  { key: 'share_personal', title: 'Mis gastos personales', hint: 'Lo que gastas solo tú. Los gastos compartidos se ven siempre.' },
  { key: 'share_savings', title: 'Mis aportes a metas', hint: 'Cuánto pones tú en cada meta.' },
]

/** Qué ve tu pareja de lo tuyo. El sueldo, los ingresos extra y el análisis son siempre privados. */
export default function PartnerPrivacyCard({ hh, reload, onToast }: { hh: Household; reload: () => Promise<void>; onToast: Notify }) {
  const partner = hh.members.find((m) => m.user_id !== hh.me.user_id)
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)
  // Si la base aún no tiene estas opciones, no se muestran controles que no harían nada
  const available = typeof hh.me.share_debts === 'boolean'

  async function save(patch: Partial<Record<Key, boolean>>) {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('members').update(patch).eq('user_id', hh.me.user_id)
    setBusy(false)
    if (err) {
      setError('No se pudo guardar. Intenta de nuevo.')
      return
    }
    onToast('Privacidad actualizada\nLos cambios ya valen para tu **pareja**.')
    await reload()
  }

  if (!available) {
    return (
      <section className="card">
        <strong>Privacidad con tu pareja</strong>
        <span className="muted">Esta opción aún no está activa en tu base de datos. Aplica la migración de privacidad y recarga.</span>
      </section>
    )
  }
  if (!partner) {
    return (
      <section className="card">
        <strong>Privacidad con tu pareja</strong>
        <span className="muted">
          Cuando sumes a tu pareja al hogar, aquí eliges qué ve de lo tuyo. Por ahora todo lo que anotas lo ves solo tú.
        </span>
      </section>
    )
  }

  const allShared = TOPICS.every((t) => hh.me[t.key])
  const noneShared = TOPICS.every((t) => !hh.me[t.key])
  const theirHidden = TOPICS.filter((t) => partner[t.key] === false).map((t) => t.title.replace(/^Mis /, ''))

  return (
    <section className="card">
      <strong>Privacidad con {partner.display_name}</strong>
      <span className="muted small-text">Tú decides qué ve {partner.display_name} de lo tuyo. Puedes cambiarlo cuando quieras.</span>
      <div className="row">
        <button type="button" className="btn small" disabled={busy || allShared} onClick={() => void save({ share_debts: true, share_fixed: true, share_personal: true, share_savings: true })}>
          Compartir todo
        </button>
        <button type="button" className="btn ghost small" disabled={busy || noneShared} onClick={() => void save({ share_debts: false, share_fixed: false, share_personal: false, share_savings: false })}>
          Ocultar todo
        </button>
      </div>
      <div className="privacy-list">
        {TOPICS.map((t) => (
          <div className="privacy-row" key={t.key}>
            <div className="grow">
              <span id={`pv-${t.key}`} className="strong">{t.title}</span>
              <span className="line-help">{t.hint}</span>
            </div>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={hh.me[t.key]}
              aria-labelledby={`pv-${t.key}`}
              disabled={busy}
              onClick={() => void save({ [t.key]: !hh.me[t.key] })}
            />
          </div>
        ))}
      </div>
      <div className="privacy-fixed">
        <strong className="small-text">Siempre privado</strong>
        <span className="muted small-text">Tu sueldo, tus ingresos extra, tu análisis y tu perfil financiero. Nadie más los ve, ni siquiera tu pareja.</span>
        <strong className="small-text">Siempre visible</strong>
        <span className="muted small-text">Los gastos, fijos y deudas compartidos: son de los dos.</span>
      </div>
      {theirHidden.length > 0 && (
        <span className="notice">
          {partner.display_name} no comparte contigo: {theirHidden.join(', ').toLowerCase()}.
        </span>
      )}
    </section>
  )
}
