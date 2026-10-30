import { useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Avatar from '../components/Avatar'
import EmailCard from '../components/EmailCard'
import FinancialProfile from '../components/FinancialProfile'
import HomeCard from '../components/HomeCard'
import PartnerPrivacyCard from '../components/PartnerPrivacyCard'
import PasswordCard from '../components/PasswordCard'
import ProfileCard from '../components/ProfileCard'
import SettingsItem from '../components/SettingsItem'
import type { Notify } from '../components/Toast'

/** Perfil: quién eres con la plata, tu cuenta, tu hogar y qué ve tu pareja de lo tuyo */
export default function Profile({
  hh,
  data,
  month,
  reload,
  onToast,
  onGoSalary,
  onBack,
}: {
  hh: Household
  data: HouseholdData
  month: Date
  reload: () => Promise<void>
  onToast: Notify
  onGoSalary: () => void
  onBack?: () => void
}) {
  const partner = hh.members.find((m) => m.user_id !== hh.me.user_id)
  // Se pueden abrir varios a la vez; parte abierto el perfil financiero
  const [open, setOpen] = useState<Set<string>>(new Set(['fin']))
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const item = { onToggle: toggle }
  return (
    <main className="screen">
      {onBack && (
        <button type="button" className="btn ghost small" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          Volver a Ajustes
        </button>
      )}
      <div className="card wide profile-head">
        <Avatar name={hh.me.display_name} color={hh.me.color} size={56} />
        <div className="grow">
          <h1 className="title">Mi perfil</h1>
          <span className="muted">
            {hh.household.name}
            {partner ? ` · con ${partner.display_name}` : ' · 1 de 2 personas'}
          </span>
        </div>
      </div>

      <div className="set-list profile-acc">
        <SettingsItem {...item} id="fin" icon="target" title="Mi perfil financiero" summary="Qué perfil eres hoy y cómo subir de nivel" open={open.has('fin')}>
          <FinancialProfile hh={hh} data={data} month={month} onGoSalary={onGoSalary} />
        </SettingsItem>
      </div>

      <div className="set-list profile-acc">
        <SettingsItem {...item} id="account" icon="user" title="Mi cuenta" summary="Nombre, correo y contraseña" open={open.has('account')}>
          <ProfileCard hh={hh} data={data} reload={reload} onToast={onToast} />
          <EmailCard onToast={onToast} />
          <PasswordCard title onToast={onToast} />
        </SettingsItem>
      </div>

      <div className="set-list profile-acc">
        <SettingsItem
          {...item}
          id="home"
          icon="home"
          title="Mi hogar"
          summary={partner ? `${hh.household.name} · con ${partner.display_name}` : `${hh.household.name} · 1 de 2 personas`}
          open={open.has('home')}
        >
          <HomeCard hh={hh} reload={reload} onToast={onToast} />
        </SettingsItem>
      </div>

      <div className="set-list profile-acc">
        <SettingsItem
          {...item}
          id="privacy"
          icon="lock"
          title="Privacidad con mi pareja"
          summary={partner ? `Tú decides qué ve ${partner.display_name} de lo tuyo` : 'Disponible cuando sumes a tu pareja'}
          open={open.has('privacy')}
        >
          <PartnerPrivacyCard hh={hh} reload={reload} onToast={onToast} />
        </SettingsItem>
      </div>
    </main>
  )
}
