// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import CaptureAppsPicker from './CaptureAppsPicker'
import Modal from './Modal'
import NotificationPermission from './NotificationPermission'
import { SkeletonCard } from './Skeleton'
import type { Notify } from './Toast'
import { effectivePackages } from '../lib/captureApps'
import { LIMIT_CHOICES } from '../lib/captureConfig'
import type { CaptureConfig } from '../lib/captureConfig'
import { money } from '../lib/format'
import { ContigoNative } from '../lib/nativeBridge'
import { useCaptureStatus } from '../lib/useCaptureStatus'
import { logError } from '../lib/safeLog'

interface Props {
  config: CaptureConfig
  onConfig: (next: CaptureConfig) => Promise<void>
  onToast: Notify
  /** Después de borrar lo capturado, para que la bandeja se actualice */
  onCleared: () => void
}

function Switch({ id, label, hint, on, onChange }: { id: string; label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row between">
      <div className="stack tight">
        <strong id={id}>{label}</strong>
        <span className="muted small-text">{hint}</span>
      </div>
      <button type="button" role="switch" className="switch" aria-checked={on} aria-labelledby={id} onClick={() => onChange(!on)} />
    </div>
  )
}

/** Ajustes > Captura de gastos: permiso, interruptor, apps, modo automático, privacidad y borrado. Solo funciona en la app del teléfono. */
export default function CaptureSettings({ config, onConfig, onToast, onCleared }: Props) {
  const { state, reload } = useCaptureStatus()
  const [confirmWipe, setConfirmWipe] = useState(false)

  if (state.kind === 'web') {
    return (
      <section className="card" role="note">
        <strong>Solo está en la app del teléfono</strong>
        <span className="muted">La captura de gastos desde los avisos del banco funciona en la app de Android. En el navegador puedes anotar tus gastos con «Registrar».</span>
      </section>
    )
  }
  if (state.kind === 'loading') return <SkeletonCard lines={4} label="Leyendo el estado de la captura…" />
  if (state.kind === 'error') {
    return (
      <section className="card" role="alert">
        <strong>No pudimos leer el estado de la captura</strong>
        <span className="muted">Es algo del teléfono, no de tu cuenta.</span>
        <button type="button" className="btn small" onClick={() => void reload()}>
          Reintentar
        </button>
      </section>
    )
  }
  const { status } = state

  /** Aplica la preferencia en el teléfono y la guarda; si algo falla lo dice. */
  async function apply(next: CaptureConfig) {
    try {
      await ContigoNative.setAllowedPackages({ packages: effectivePackages(next) })
      await onConfig(next)
      await reload()
    } catch (e) {
      logError(e, 'CaptureSettings')
      onToast('No se pudo guardar el cambio\nInténtalo de nuevo.', 'error')
    }
  }

  async function setHide(hide: boolean) {
    try {
      await ContigoNative.setHideOnLockScreen({ hide })
      await reload()
    } catch (e) {
      logError(e, 'CaptureSettings')
      onToast('No se pudo guardar el cambio\nInténtalo de nuevo.', 'error')
    }
  }

  async function wipeCaptured() {
    setConfirmWipe(false)
    try {
      await ContigoNative.clearCaptured()
      onCleared()
      onToast('Borrado\nSe borró todo lo capturado en este teléfono.', 'info')
    } catch (e) {
      logError(e, 'CaptureSettings')
      onToast('No se pudo borrar\nInténtalo de nuevo.', 'error')
    }
  }

  const permission = status.listenerAllowed ? 'granted' : status.revokedSinceConnected ? 'denied' : 'default'
  const openGuide = () => void ContigoNative.openPermissionGuide().catch((e: unknown) => logError(e, 'CaptureSettings'))

  return (
    <div className="stack">
      <NotificationPermission permission={permission} wasGranted={status.revokedSinceConnected} onOpenSystemSettings={openGuide} onRequest={openGuide} showRestrictedHelp={status.restrictedSettingsLikely} />
      {permission === 'granted' && <span className="muted small-text" role="status">El acceso a las notificaciones está activo.</span>}

      <section className="card">
        <Switch id="cap-on" label="Detectar mis gastos" hint="Si lo apagas, el teléfono no lee ningún aviso. Tu lista de apps se recuerda." on={config.enabled} onChange={(enabled) => void apply({ ...config, enabled })} />
        <CaptureAppsPicker selected={config.savedPackages} onChange={(savedPackages) => apply({ ...config, savedPackages })} />
      </section>

      <section className="card">
        <Switch id="cap-auto" label="Modo automático" hint="Guarda solo los gastos seguros que ya conoces, sin preguntar. Siempre puedes deshacer durante 10 segundos." on={config.mode === 'AUTO'} onChange={(on) => void apply({ ...config, mode: on ? 'AUTO' : 'CONFIRM' })} />
        {config.mode === 'AUTO' && (
          <div className="field">
            <label htmlFor="cap-limit">Monto máximo para guardar solo</label>
            <select id="cap-limit" className="input" value={config.maxClp} onChange={(e) => void apply({ ...config, maxClp: Number(e.target.value) })}>
              {LIMIT_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {money(m)}
                </option>
              ))}
            </select>
            <span className="line-help">Lo que supere este monto siempre te lo preguntamos.</span>
          </div>
        )}
        <Switch id="cap-shared" label="Marcar como compartidos" hint="Los gastos detectados parten como compartidos con tu pareja." on={config.shared} onChange={(shared) => void apply({ ...config, shared })} />
      </section>

      <section className="card">
        <Switch id="cap-hide" label="Ocultar montos con el teléfono bloqueado" hint="La notificación no muestra cuánto ni dónde. Recomendado." on={status.hideOnLockScreen} onChange={(v) => void setHide(v)} />
      </section>

      <section className="card">
        <strong>Borrar todo lo capturado</strong>
        <span className="muted small-text">Quita de este teléfono los gastos detectados que aún no confirmaste. Tus gastos ya guardados no se tocan.</span>
        <button type="button" className="btn danger small" onClick={() => setConfirmWipe(true)}>
          Borrar lo capturado
        </button>
      </section>

      {confirmWipe && (
        <Modal onClose={() => setConfirmWipe(false)} label="Borrar lo capturado">
          <div className="stack picker">
            <h2 className="perm-title">¿Borrar lo capturado?</h2>
            <p className="muted">Se borran los gastos detectados que están esperando en este teléfono.</p>
            <button type="button" className="btn danger" onClick={() => void wipeCaptured()}>
              Sí, borrar
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirmWipe(false)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
