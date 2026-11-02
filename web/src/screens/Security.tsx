import LegalModal from '../components/LegalModal'
import { Suspense, lazy, useState } from 'react'
import type { Household } from '../App'
import AboutCard from '../components/AboutCard'
import InstallGuide from '../components/InstallGuide'
import BackupCard from '../components/BackupCard'
import LockSettings from '../components/LockSettings'
import SecurityInfo from '../components/SecurityInfo'
import SettingsItem from '../components/SettingsItem'
import AccessCard from '../components/AccessCard'
import PasswordCard from '../components/PasswordCard'
import MfaCard from '../components/MfaCard'
import { getLockMinutes } from '../lib/applock'
import { VERSION } from '../lib/about'
import LeaveAccount from '../components/LeaveAccount'
import PushToggle from '../components/PushToggle'
import ThemeToggle from '../components/ThemeToggle'
import { useIsAdmin } from '../lib/admin'
import { supabase } from '../lib/supabase'
import type { Notify } from '../components/Toast'

const Admin = lazy(() => import('./Admin'))

export default function Security({
  hh,
  reload,
  onToast,
  onHelp,
  onProfile,
}: {
  hh: Household
  reload: () => Promise<void>
  onToast: Notify
  onHelp: () => void
  onProfile: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id))
  const isAdmin = useIsAdmin()
  const [showAdmin, setShowAdmin] = useState(false)
  const [legal, setLegal] = useState<'privacy' | 'terms' | null>(null)

  if (showAdmin && isAdmin) {
    return (
      <Suspense fallback={<main className="screen center-y"><p className="muted">Cargando…</p></main>}>
        <Admin onBack={() => setShowAdmin(false)} onToast={onToast} />
      </Suspense>
    )
  }

  const item = { open: false, onToggle: toggle }
  const lockMin = getLockMinutes()
  const partner = hh.members.find((m) => m.user_id !== hh.me.user_id)

  return (
    <main className="screen">
      <h1 className="title">Ajustes</h1>

      {isAdmin && (
        <section className="card">
          <strong>Administración</strong>
          <span className="muted small-text">Mira cuánta gente usa la app y qué funciones se ocupan más.</span>
          <button type="button" className="btn small" onClick={() => setShowAdmin(true)}>
            Abrir el panel de administración
          </button>
        </section>
      )}

      <h2 className="set-group">Cuenta</h2>
      <div className="set-list">
        <SettingsItem
          {...item}
          id="profile"
          icon="user"
          title="Mi perfil, hogar y privacidad"
          summary={partner ? `${hh.me.display_name} · ${hh.household.name}, con ${partner.display_name}` : `${hh.me.display_name} · ${hh.household.name}, 1 de 2 personas`}
          open={false}
          onGo={onProfile}
        />

        <SettingsItem {...item} id="help" icon="help" title="Ayuda y consejos" summary="Cómo se usa la app, guía de bienvenida y novedades" open={false} onGo={onHelp} />

        <SettingsItem {...item} id="theme" icon="gear" title="Apariencia" summary="Claro, oscuro o automático" open={open === 'theme'}>
          <ThemeToggle />
        </SettingsItem>
      </div>

      <h2 className="set-group">Seguridad</h2>
      <div className="set-list">
        <SettingsItem {...item} id="password" icon="lock" title="Contraseña y sesiones" summary="Cambiar contraseña, cerrar otras sesiones" open={open === 'password'}>
          <PasswordCard onToast={onToast} />
        </SettingsItem>

        <SettingsItem {...item} id="mfa" icon="shield" title="Verificación en dos pasos" summary="Un código extra al entrar" open={open === 'mfa'}>
          <MfaCard onToast={onToast} />
        </SettingsItem>

        <SettingsItem
          {...item}
          id="lock"
          icon="lock"
          title="Bloqueo de la app"
          summary={lockMin > 0 ? `Se bloquea tras ${lockMin} ${lockMin === 1 ? 'minuto' : 'minutos'}` : 'Desactivado'}
          open={open === 'lock'}
        >
          <LockSettings onToast={onToast} />
        </SettingsItem>

        {isAdmin && (
          <SettingsItem {...item} id="security" icon="shield" title="Seguridad de Contigo" summary="Qué la protege de verdad, comprobado en vivo" open={open === 'security'}>
            <SecurityInfo />
          </SettingsItem>
        )}
      </div>

      <h2 className="set-group">Aplicación</h2>
      <div className="set-list">
        <SettingsItem {...item} id="install" icon="download" title="Cómo instalar Contigo" summary="En iPhone o Android" open={open === 'install'}>
          <section className="card">
            <InstallGuide onToast={onToast} />
          </section>
        </SettingsItem>
        {isAdmin && (
          <SettingsItem {...item} id="access" icon="wallet" title="Instalación y conexión" summary="Internet, app instalada y avisos" open={open === 'access'}>
            <AccessCard onToast={onToast} />
          </SettingsItem>
        )}
        <SettingsItem {...item} id="notify" icon="bell" title="Notificaciones" summary="Avisos de tu pareja y de la app" open={open === 'notify'}>
          <PushToggle isAdmin={isAdmin} onToast={onToast} />
        </SettingsItem>
      </div>

      <h2 className="set-group">Tus datos</h2>
      <div className="set-list">
        <SettingsItem {...item} id="backup" icon="download" title="Respaldo y exportación" summary="Descarga una copia de tus datos" open={open === 'backup'}>
          <BackupCard onToast={onToast} />
        </SettingsItem>
        <SettingsItem {...item} id="danger" icon="trash" tone="danger" title="Salir del hogar o borrar la cuenta" summary="Acciones que no se pueden deshacer" open={open === 'danger'}>
          <LeaveAccount hh={hh} reload={reload} onToast={onToast} />
        </SettingsItem>
      </div>

      <h2 className="set-group">Información</h2>
      <div className="set-list">
        <SettingsItem {...item} id="legal" icon="shield" title="Privacidad y términos" summary="Qué datos guardamos y las reglas de uso" open={open === 'legal'}>
          <section className="card">
            <span className="muted">Lee con calma qué datos guarda Contigo, para qué se usan y las reglas para usar la app.</span>
            <button type="button" className="btn ghost small" onClick={() => setLegal('privacy')}>
              Política de privacidad
            </button>
            <button type="button" className="btn ghost small" onClick={() => setLegal('terms')}>
              Términos y condiciones
            </button>
          </section>
        </SettingsItem>

        <SettingsItem {...item} id="about" icon="info" title="Acerca de Contigo" summary={`Versión ${VERSION}`} open={open === 'about'}>
          <AboutCard onToast={onToast} />
        </SettingsItem>
      </div>

      <button className="btn danger" type="button" onClick={() => void supabase.auth.signOut()}>
        Cerrar sesión
      </button>
      {legal && <LegalModal doc={legal} onClose={() => setLegal(null)} />}
    </main>
  )
}
