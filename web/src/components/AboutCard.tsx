import { useEffect, useState } from 'react'
import { BUILD_DATE, COMMIT, TAGLINE, VERSION, checkForUpdate, copyright } from '../lib/about'
import { nativeCopy, parseAppInfo } from '../lib/appUpdate'
import type { AppInfo } from '../lib/appUpdate'
import { checkUpdates, useUpdateState } from '../lib/appUpdateStore'
import { ContigoNative, isNativeApp } from '../lib/nativeBridge'
import Logo from './Logo'
import LicensesCard from './LicensesCard'
import type { Notify } from './Toast'

const fmtDate = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

/** Acerca de Contigo: versión, derechos y un gracias. */
export default function AboutCard({ onToast, onPrivacy }: { onToast: Notify; onPrivacy?: () => void }) {
  const [busy, setBusy] = useState(false)
  const native = isNativeApp()
  const upd = useUpdateState()
  const [info, setInfo] = useState<AppInfo | null | undefined>(undefined)

  useEffect(() => {
    if (!native) return
    let alive = true
    ContigoNative.getAppInfo()
      .then((r) => alive && setInfo(parseAppInfo(r)))
      .catch(() => alive && setInfo(null))
    return () => {
      alive = false
    }
  }, [native])

  async function nativeUpdate() {
    await checkUpdates(true)
  }

  const updateStatus =
    upd.phase === 'checking'
      ? 'Buscando…'
      : upd.phase === 'uptodate'
        ? nativeCopy.upToDate
        : upd.info.available
          ? `Hay una versión nueva (${upd.info.versionName})`
          : upd.phase === 'error'
            ? (upd.error?.text ?? 'No se pudo comprobar')
            : 'Sin revisar todavía'

  async function update() {
    setBusy(true)
    try {
      const r = await checkForUpdate()
      if (r === 'updating') onToast('Hay una versión nueva\nLa estoy instalando; la app se **recargará** sola.', 'info')
      else if (r === 'up-to-date') onToast('Estás al día\nYa tienes la **última versión**.')
      else onToast('No se pudo buscar\nEste navegador no lo permite. Recarga la página para tener la última.', 'warn')
    } catch {
      onToast('No se pudo comprobar\nRevisa tu conexión e inténtalo de nuevo.', 'error')
    }
    setBusy(false)
  }

  return (
    <section className="card about" aria-label="Acerca de esta app">
      <div className="about-head">
        <Logo size={56} animate />
        <div>
          <strong className="about-name">Contigo</strong>
          <span className="muted small-text about-tag">{TAGLINE}</span>
        </div>
      </div>

      {native ? (
        <dl className="about-facts">
          <div>
            <dt>Tipo</dt>
            <dd>{nativeCopy.appKind}</dd>
          </div>
          <div>
            <dt>Versión</dt>
            <dd className="num">{info === undefined ? '…' : (info?.versionName ?? 'No disponible')}</dd>
          </div>
          <div>
            <dt>Compilación</dt>
            <dd className="num">{info === undefined ? '…' : (info?.versionCode ?? 'No disponible')}</dd>
          </div>
          <div>
            <dt>{nativeCopy.updatesTitle}</dt>
            <dd aria-live="polite">{updateStatus}</dd>
          </div>
        </dl>
      ) : (
      <dl className="about-facts">
        <div>
          <dt>Versión</dt>
          <dd className="num">{VERSION}</dd>
        </div>
        <div>
          <dt>Compilada</dt>
          <dd>{fmtDate.format(BUILD_DATE)}</dd>
        </div>
        {COMMIT && (
          <div>
            <dt>Build</dt>
            <dd className="num">{COMMIT}</dd>
          </div>
        )}
      </dl>
      )}

      {native ? (
        <button type="button" className="btn ghost small" disabled={upd.phase === 'checking'} onClick={() => void nativeUpdate()}>
          {upd.phase === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
        </button>
      ) : (
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => void update()}>
          {busy ? 'Buscando…' : 'Buscar actualizaciones'}
        </button>
      )}

      {onPrivacy && (
        <button type="button" className="btn ghost small" onClick={onPrivacy}>
          Política de privacidad
        </button>
      )}
      <LicensesCard />

      <p className="about-thanks">
        <strong>Gracias por usar Contigo.</strong> Hecho con cariño para que cuidar la plata sea cosa de a dos… o de a uno.
        Tus datos son tuyos: puedes borrarlos cuando quieras, más arriba en esta misma pantalla.
      </p>
      <p className="muted small-text about-rights">{copyright()}</p>
    </section>
  )
}
