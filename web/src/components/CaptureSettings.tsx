// Copyright (c) 2026 Dinovance
import { useCallback, useEffect, useState } from 'react'
import BankAutoSection from './BankAutoSection'
import BankConsentSheet from './BankConsentSheet'
import BankTrustSheet from './BankTrustSheet'
import CaptureDiagnostics from './CaptureDiagnostics'
import CaptureAppsPicker from './CaptureAppsPicker'
import PartnerAlerts from './PartnerAlerts'
import Modal from './Modal'
import NotificationPermission from './NotificationPermission'
import { SkeletonCard } from './Skeleton'
import type { Notify } from './Toast'
import { activatedMessage, parseDetectedBanks, summarizeCapture } from '../lib/bankConsent'
import type { DetectedBank, DetectedBanksApi } from '../lib/bankConsent'
import { effectivePackages } from '../lib/captureApps'
import type { CaptureConfig } from '../lib/captureConfig'
import { ContigoNative } from '../lib/nativeBridge'
import { useCaptureStatus } from '../lib/useCaptureStatus'
import { logError } from '../lib/safeLog'

const bankApi = ContigoNative as unknown as DetectedBanksApi

interface Props {
  config: CaptureConfig
  onConfig: (next: CaptureConfig) => Promise<void>
  onToast: Notify
  /** Después de borrar lo capturado, para que la bandeja se actualice */
  onCleared: () => void
  /** «Enviar ahora»: reintenta lo que quedó sin enviar */
  onSendNow: () => Promise<void>
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
export default function CaptureSettings({ config, onConfig, onToast, onCleared, onSendNow }: Props) {
  const { state, reload } = useCaptureStatus()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [connect, setConnect] = useState(false)
  const [trust, setTrust] = useState(false)
  const [detected, setDetected] = useState<DetectedBank[] | null>(null)

  const loadDetected = useCallback(async () => {
    try {
      setDetected(parseDetectedBanks(await bankApi.getDetectedBanks()))
    } catch {
      setDetected([])
    }
  }, [])
  useEffect(() => {
    const t = window.setTimeout(() => void loadDetected(), 0)
    return () => window.clearTimeout(t)
  }, [loadDetected])

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
  const summary = summarizeCapture({ listenerAllowed: status.listenerAllowed, enabled: config.enabled, revoked: status.revokedSinceConnected })
  const autoOn = config.mode === 'AUTO'

  async function setAutoAll(on: boolean) {
    try {
      await bankApi.setAutoSaveAll({ enabled: on })
      await apply({ ...config, mode: on ? 'AUTO' : 'CONFIRM' })
      if (on && detected && detected.length > 0) onToast(activatedMessage(detected))
    } catch (e) {
      logError(e, 'CaptureSettings')
      onToast('No se pudo guardar el cambio\nInténtalo de nuevo.', 'error')
    }
  }

  return (
    <div className="stack">
      <NotificationPermission permission={permission} wasGranted={status.revokedSinceConnected} onOpenSystemSettings={openGuide} onRequest={openGuide} showRestrictedHelp={status.restrictedSettingsLikely} />

      <section className="card">
        <div className="row between">
          <strong>Estado</strong>
          <span className={summary.kind === 'active' ? 'strong' : summary.kind === 'no-permission' ? 'over' : 'muted'} role="status">
            {summary.label}
          </span>
        </div>
        <Switch id="cap-auto" label="Guardar solos mis gastos" hint="Siempre puedes deshacer." on={autoOn} onChange={(on) => void setAutoAll(on)} />
        {detected === null ? (
          <span className="muted small-text" role="status">
            Buscando tus bancos…
          </span>
        ) : detected.length > 0 ? (
          <ul className="chips" aria-label="Bancos encontrados">
            {detected.map((b) => (
              <li key={b.id} className="chip">
                {b.name}
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted small-text">Aún no hay bancos conectados.</span>
        )}
        <span className="muted small-text">Solo lee avisos de gasto de tus bancos; nunca claves ni mensajes personales.</span>
        <div className="row">
          {(detected === null || detected.length === 0 || !status.listenerAllowed) && (
            <button type="button" className="btn small" onClick={() => setConnect(true)}>
              Conectar mis bancos
            </button>
          )}
          <button type="button" className="btn ghost small" onClick={() => setTrust(true)}>
            Ver qué hace la app
          </button>
        </div>
      </section>

      <button type="button" className="btn ghost small" aria-expanded={advanced} aria-controls="cap-advanced" onClick={() => setAdvanced(!advanced)}>
        {advanced ? 'Ocultar avanzado' : 'Avanzado'}
      </button>

      {advanced && (
        <div className="stack" id="cap-advanced">
          <section className="card">
            <Switch id="cap-on" label="Leer avisos de mis bancos" hint="Apágalo para pausar." on={config.enabled} onChange={(enabled) => void apply({ ...config, enabled })} />
            <Switch id="cap-shared" label="Gastos compartidos" hint="Parten como compartidos con tu pareja." on={config.shared} onChange={(shared) => void apply({ ...config, shared })} />
            <Switch id="cap-hide" label="Ocultar montos con el teléfono bloqueado" hint="Recomendado." on={status.hideOnLockScreen} onChange={(v) => void setHide(v)} />
          </section>

          <section className="card">
            <CaptureAppsPicker selected={config.savedPackages} onChange={(savedPackages) => apply({ ...config, savedPackages })} />
          </section>

          <BankAutoSection config={config} onConfig={onConfig} onToast={onToast} onSendNow={onSendNow} />

          <PartnerAlerts onToast={onToast} />

          <CaptureDiagnostics onToast={onToast} />

          <section className="card">
            <strong>Borrar todo lo capturado</strong>
            <span className="muted small-text">Quita de este teléfono lo detectado que aún no confirmaste. Lo ya guardado no se toca.</span>
            <button type="button" className="btn danger small" onClick={() => setConfirmWipe(true)}>
              Borrar lo capturado
            </button>
          </section>
        </div>
      )}

      {connect && (
        <BankConsentSheet
          config={config}
          onConfig={onConfig}
          onToast={onToast}
          onClose={(choose) => {
            setConnect(false)
            if (choose) setAdvanced(true)
            void reload()
            void loadDetected()
          }}
        />
      )}
      {trust && <BankTrustSheet onClose={() => setTrust(false)} />}

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
