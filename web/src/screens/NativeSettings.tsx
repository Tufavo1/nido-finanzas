// Copyright (c) 2026 Dinovance
import { signOutClean } from '../lib/signOut'
import { Suspense, lazy, useEffect, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import AboutCard from '../components/AboutCard'
import AutoExpenses from '../components/AutoExpenses'
import BackupCard from '../components/BackupCard'
import EmailCard from '../components/EmailCard'
import FinancialProfile from '../components/FinancialProfile'
import HapticsToggle from '../components/HapticsToggle'
import HomeCard from '../components/HomeCard'
import LeaveAccount from '../components/LeaveAccount'
import LegalModal from '../components/LegalModal'
import LockSettings from '../components/LockSettings'
import MfaCard from '../components/MfaCard'
import NativePushToggle from '../components/NativePushToggle'
import PartnerAlertSwitch from '../components/PartnerAlertSwitch'
import PartnerPrivacyCard from '../components/PartnerPrivacyCard'
import PasswordCard from '../components/PasswordCard'
import ProfileCard from '../components/ProfileCard'
import ScreenLoader from '../components/ScreenLoader'
import SettingsItem from '../components/SettingsItem'
import ThemeToggle from '../components/ThemeToggle'
import type { Notify } from '../components/Toast'
import { parseAppInfo } from '../lib/appUpdate'
import { getLockMinutes } from '../lib/applock'
import { VERSION, copyright } from '../lib/about'
import { useAccount } from '../lib/account'
import { useIsAdmin } from '../lib/admin'
import type { CaptureConfig } from '../lib/captureConfig'
import { ContigoNative } from '../lib/nativeBridge'
import { NATIVE_GROUPS } from '../lib/nativeSettings'
import { logError } from '../lib/safeLog'
import { supabase } from '../lib/supabase'
import { getThemePref } from '../lib/theme'
import { useCaptureStatus } from '../lib/useCaptureStatus'

const Admin = lazy(() => import('./Admin'))

const THEME_NAME = { system: 'Automática · sigue a tu teléfono', light: 'Clara', dark: 'Oscura' } as const
const title = (id: (typeof NATIVE_GROUPS)[number]['id']) => NATIVE_GROUPS.find((g) => g.id === id)!.title

/** ¿Tiene verificación en dos pasos? null = todavía no se sabe */
function useMfaOn(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    supabase.auth.mfa.listFactors().then(
      ({ data }) => alive && setOn((data?.totp.length ?? 0) > 0),
      () => alive && setOn(null),
    )
    return () => {
      alive = false
    }
  }, [])
  return on
}

/** «Montos a la vista con el teléfono bloqueado»: un interruptor */
function HideAmountsRow({ onToast }: { onToast: Notify }) {
  const { state, reload } = useCaptureStatus()
  if (state.kind !== 'ready') return null
  const on = state.status.hideOnLockScreen
  const change = (hide: boolean) =>
    void ContigoNative.setHideOnLockScreen({ hide }).then(reload, (e: unknown) => {
      logError(e, 'NativeSettings')
      onToast('No se pudo guardar el cambio\nInténtalo de nuevo.', 'error')
    })
  return (
    <div className="row between tap auto-row set-plain" onClick={() => change(!on)}>
      <div className="stack tight">
        <strong id="hide-amounts">Ocultar montos con el teléfono bloqueado</strong>
        <span className="muted small-text" id="hide-amounts-sum">
          {on ? 'Activado · los avisos no muestran montos' : 'Apagado · los avisos muestran montos'}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={on}
        aria-labelledby="hide-amounts"
        aria-describedby="hide-amounts-sum"
        onClick={(e) => {
          e.stopPropagation()
          change(!on)
        }}
      />
    </div>
  )
}

interface Props {
  hh: Household
  data: HouseholdData
  month: Date
  reload: () => Promise<void>
  onToast: Notify
  onHelp: () => void
  onGoSalary: () => void
  capture: CaptureConfig
  onCapture: (next: CaptureConfig) => Promise<void>
  onCleared: () => void
  onSendNow: () => Promise<void>
}

/** Ajustes de la APK: seis grupos, cada uno dice qué hace y en qué estado está. La web usa Security. */
export default function NativeSettings({ hh, data, month, reload, onToast, onHelp, onGoSalary, capture, onCapture, onCleared, onSendNow }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id))
  const isAdmin = useIsAdmin()
  const account = useAccount()
  const mfaOn = useMfaOn()
  const [showAdmin, setShowAdmin] = useState(false)
  const [legal, setLegal] = useState<'privacy' | 'terms' | null>(null)
  const [version, setVersion] = useState<string>(VERSION)

  useEffect(() => {
    let alive = true
    ContigoNative.getAppInfo().then(
      (r) => {
        const info = parseAppInfo(r)
        if (alive && info) setVersion(info.versionName)
      },
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])

  if (showAdmin && isAdmin) {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <Admin onBack={() => setShowAdmin(false)} onToast={onToast} />
      </Suspense>
    )
  }

  const item = { open: false, onToggle: toggle }
  const partner = hh.members.find((m) => m.user_id !== hh.me.user_id)
  const lockMin = getLockMinutes()
  const protections = [lockMin > 0, mfaOn === true, account.hasPassword].filter(Boolean).length
  const homeSummary = partner ? `${hh.household.name} · con ${partner.display_name}` : `${hh.household.name} · 1 de 2 personas`

  return (
    <main className="screen">
      <h1 className="title">Ajustes</h1>

      <h2 className="set-group">{title('auto')}</h2>
      <AutoExpenses config={capture} onConfig={onCapture} onToast={onToast} onCleared={onCleared} onSendNow={onSendNow} />

      <h2 className="set-group">{title('avisos')}</h2>
      <div className="stack">
        <PartnerAlertSwitch hasPartner={partner !== undefined} onToast={onToast} />
        <NativePushToggle onToast={onToast} />
      </div>

      <h2 className="set-group">{title('seguridad')}</h2>
      <p className="muted small-text set-line" role="status">
        Tu cuenta tiene {protections} de 3 protecciones activas.
      </p>
      <div className="set-list">
        <SettingsItem
          {...item}
          id="lock"
          icon="lock"
          title="Bloqueo de la app"
          summary={lockMin > 0 ? `Se bloquea tras ${lockMin} ${lockMin === 1 ? 'minuto' : 'minutos'} sin usarla` : 'Apagado'}
          open={open === 'lock'}
        >
          <LockSettings onToast={onToast} />
        </SettingsItem>
        <SettingsItem
          {...item}
          id="mfa"
          icon="shield"
          title="Verificación en dos pasos"
          summary={mfaOn === null ? 'Un código extra al entrar' : mfaOn ? 'Activada' : 'Apagada · un código extra al entrar'}
          open={open === 'mfa'}
        >
          <MfaCard onToast={onToast} />
        </SettingsItem>
        <SettingsItem
          {...item}
          id="password"
          icon="lock"
          title="Contraseña y sesiones"
          summary={account.hasPassword ? 'Cambiar contraseña o cerrar otras sesiones' : 'Aún no tienes contraseña: créala'}
          open={open === 'password'}
        >
          <PasswordCard onToast={onToast} />
        </SettingsItem>
        <HideAmountsRow onToast={onToast} />
      </div>

      <h2 className="set-group">{title('cuenta')}</h2>
      <div className="set-list">
        <SettingsItem {...item} id="fin" icon="target" title="Mi perfil financiero" summary="Qué perfil eres hoy y cómo subir de nivel" open={open === 'fin'}>
          <FinancialProfile hh={hh} data={data} month={month} onGoSalary={onGoSalary} />
        </SettingsItem>
        <SettingsItem {...item} id="account" icon="user" title="Mis datos de acceso" summary={hh.me.display_name} open={open === 'account'}>
          <ProfileCard hh={hh} data={data} reload={reload} onToast={onToast} />
          <EmailCard onToast={onToast} />
        </SettingsItem>
        <SettingsItem {...item} id="home" icon="home" title="Mi hogar" summary={homeSummary} open={open === 'home'}>
          <HomeCard hh={hh} reload={reload} onToast={onToast} />
        </SettingsItem>
        <SettingsItem
          {...item}
          id="privacy"
          icon="lock"
          title="Privacidad con mi pareja"
          summary={partner ? `Tú decides qué ve ${partner.display_name} de lo tuyo` : 'Disponible cuando sumes a tu pareja'}
          open={open === 'privacy'}
        >
          <PartnerPrivacyCard hh={hh} reload={reload} onToast={onToast} />
        </SettingsItem>
        <SettingsItem {...item} id="theme" icon="gear" title="Apariencia y vibración" summary={THEME_NAME[getThemePref()]} open={open === 'theme'}>
          <ThemeToggle />
          <HapticsToggle />
        </SettingsItem>
      </div>

      <h2 className="set-group">{title('datos')}</h2>
      <div className="set-list">
        <SettingsItem {...item} id="backup" icon="download" title="Copia de mis datos" summary="Descarga una copia cuando quieras" open={open === 'backup'}>
          <BackupCard onToast={onToast} />
        </SettingsItem>
        <SettingsItem {...item} id="legal" icon="shield" title="Privacidad y términos" summary="Qué datos guardamos y las reglas de uso" open={open === 'legal'}>
          <section className="card">
            <span className="muted">Lee con calma qué datos guarda Contigo, para qué se usan y las reglas para usar la app.</span>
            <button type="button" className="btn ghost" onClick={() => setLegal('privacy')}>
              Política de privacidad
            </button>
            <button type="button" className="btn ghost" onClick={() => setLegal('terms')}>
              Términos y condiciones
            </button>
          </section>
        </SettingsItem>
      </div>
      <h3 className="set-sub">Zona de peligro</h3>
      <div className="set-list danger-zone">
        <SettingsItem {...item} id="danger" icon="trash" tone="danger" title="Salir del hogar o borrar la cuenta" summary="No se puede deshacer" open={open === 'danger'}>
          <LeaveAccount hh={hh} reload={reload} onToast={onToast} />
        </SettingsItem>
      </div>

      <h2 className="set-group">{title('acerca')}</h2>
      <div className="set-list">
        <SettingsItem {...item} id="about" icon="info" title="Acerca de Contigo" summary={`Versión ${version} · buscar actualizaciones`} open={open === 'about'}>
          <AboutCard onToast={onToast} onPrivacy={() => setLegal('privacy')} />
        </SettingsItem>
        <SettingsItem {...item} id="help" icon="help" title="Ayuda y consejos" summary="Cómo se usa la app y novedades" open={false} onGo={onHelp} />
        {isAdmin && <SettingsItem {...item} id="admin" icon="users" title="Administración" summary="Cuánta gente usa la app" open={false} onGo={() => setShowAdmin(true)} />}
      </div>

      <button className="btn danger" type="button" onClick={() => void signOutClean()}>
        Cerrar sesión
      </button>
      <p className="muted small-text app-footer">{copyright()}</p>
      {legal && <LegalModal doc={legal} onClose={() => setLegal(null)} />}
    </main>
  )
}
