// Copyright (c) 2026 Dinovance
import { formatBytes } from '../lib/appUpdate'
import { openInstallPermission, postponeUpdate, startUpdate, useUpdateState } from '../lib/appUpdateStore'
import Modal from './Modal'

/** Hoja «Hay una versión nueva (x.y.z)»: Actualizar ahora / Más tarde, avance accesible y errores en español simple */
export default function NativeUpdateSheet() {
  const u = useUpdateState()
  const open = u.phase === 'prompt' || u.phase === 'downloading' || u.phase === 'installing' || (u.phase === 'error' && u.info.available)
  if (!open) return null
  const working = u.phase === 'downloading' || u.phase === 'installing'
  const size = formatBytes(u.info.sizeBytes)

  return (
    <Modal onClose={working ? () => undefined : postponeUpdate} label="Actualización disponible">
      <div className="stack picker">
        <h2 className="perm-title">Hay una versión nueva ({u.info.versionName})</h2>
        {u.info.notes && <p className="muted">{u.info.notes}</p>}
        {size && u.phase === 'prompt' && <p className="muted small-text">Tamaño: {size}</p>}

        {working && (
          <div className="stack tight" aria-live="polite">
            <div
              className="progress"
              role="progressbar"
              aria-label="Descargando la actualización"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={u.percent ?? undefined}
              aria-valuetext={u.phase === 'installing' ? 'Abriendo el instalador' : u.percent === null ? 'Descargando' : `${u.percent} %`}
            >
              <span className={`progress-bar${u.percent === null ? ' indeterminate' : ''}`} style={{ width: u.percent === null ? '40%' : `${u.percent}%` }} />
            </div>
            <span className="muted small-text">{u.phase === 'installing' ? 'Abriendo el instalador…' : u.percent === null ? 'Descargando…' : `Descargando… ${u.percent} %`}</span>
          </div>
        )}

        {u.phase === 'error' && u.error && (
          <p role="alert" className="over">
            {u.error.text}
          </p>
        )}

        {u.phase === 'prompt' && (
          <>
            <button type="button" className="btn" onClick={() => void startUpdate()}>
              Actualizar ahora
            </button>
            <button type="button" className="btn ghost" onClick={postponeUpdate}>
              Más tarde
            </button>
          </>
        )}
        {u.phase === 'error' && u.error?.kind === 'permission' && (
          <>
            <button type="button" className="btn" onClick={openInstallPermission}>
              Abrir Ajustes
            </button>
            <button type="button" className="btn ghost" onClick={() => void startUpdate()}>
              Ya lo activé, reintentar
            </button>
          </>
        )}
        {u.phase === 'error' && u.error?.kind === 'retry' && (
          <button type="button" className="btn" onClick={() => void startUpdate()}>
            Reintentar
          </button>
        )}
        {u.phase === 'error' && (
          <button type="button" className="btn ghost" onClick={postponeUpdate}>
            Más tarde
          </button>
        )}
      </div>
    </Modal>
  )
}
