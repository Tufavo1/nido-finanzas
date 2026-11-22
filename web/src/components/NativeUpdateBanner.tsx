// Copyright (c) 2026 Dinovance
import { dismissBanner, openInstallPermission, startUpdate, useUpdateState } from '../lib/appUpdateStore'
import { isNativeApp } from '../lib/nativeBridge'
import { bannerView } from '../lib/updateBanner'
import type { BannerView } from '../lib/updateBanner'

interface ViewProps {
  view: BannerView
  onUpdate: () => void
  onLater: () => void
  onAllow: () => void
}

/** Solo la vista (se prueba sola). Una acción principal ancha y una secundaria. */
export function UpdateBannerView({ view, onUpdate, onLater, onAllow }: ViewProps) {
  if (view.kind === 'hidden') return null
  const title = `Hay una versión nueva de Contigo${view.version ? ` (${view.version})` : ''}`
  return (
    <div className="install-banner update-banner" role="region" aria-label="Actualización disponible">
      <strong>{title}</strong>
      <div aria-live="polite" className="stack tight">
        {view.kind === 'downloading' && (
          <>
            <div className="progress" role="progressbar" aria-label="Descargando la actualización" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.percent ?? undefined}>
              <span className={`progress-bar${view.percent === null ? ' indeterminate' : ''}`} style={{ width: view.percent === null ? '40%' : `${view.percent}%` }} />
            </div>
            <span className="small-text">{view.percent === null ? 'Descargando…' : `Descargando… ${view.percent} %`}</span>
          </>
        )}
        {view.kind === 'ready' && <span className="small-text">Listo: abriendo el instalador…</span>}
        {view.kind === 'error' && (
          <span className="small-text over" role="alert">
            {view.text}
          </span>
        )}
      </div>
      {view.kind === 'available' && (
        <div className="update-actions">
          <button type="button" className="btn" onClick={onUpdate}>
            Actualizar
          </button>
          <button type="button" className="btn ghost small" onClick={onLater}>
            Después
          </button>
        </div>
      )}
      {view.kind === 'error' && (
        <div className="update-actions">
          {view.permission ? (
            <>
              <button type="button" className="btn" onClick={onAllow}>
                Permitir
              </button>
              <button type="button" className="btn ghost small" onClick={onUpdate}>
                Ya lo activé
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={onUpdate}>
                Reintentar
              </button>
              <button type="button" className="btn ghost small" onClick={onLater}>
                Después
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Banner fijo de la app Android: aparece mientras haya una versión nueva; «Después» lo oculta solo en esta sesión. */
export default function NativeUpdateBanner() {
  const u = useUpdateState()
  return <UpdateBannerView view={bannerView(u, isNativeApp())} onUpdate={() => void startUpdate()} onLater={dismissBanner} onAllow={openInstallPermission} />
}
