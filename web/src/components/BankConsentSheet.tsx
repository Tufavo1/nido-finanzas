// Copyright (c) 2026 Dinovance
import { useEffect, useState } from 'react'
import Modal from './Modal'
import { SkeletonCard } from './Skeleton'
import type { Notify } from './Toast'
import { CAPTURE_AVAILABLE_TEXT } from '../lib/bankAuto'
import { activatedMessage, consentNext, foundLine, parseDetectedBanks, writeConsent } from '../lib/bankConsent'
import type { ConsentStep, DetectedBank, DetectedBanksApi } from '../lib/bankConsent'
import type { CaptureConfig } from '../lib/captureConfig'
import { ContigoNative } from '../lib/nativeBridge'
import { pluginErrorText } from '../lib/nativeSettings'
import { logError } from '../lib/safeLog'
import { rescanNow } from '../lib/rescan'
import { setUpdateSuppressed } from '../lib/appUpdateStore'
import { useCaptureStatus } from '../lib/useCaptureStatus'

const api = ContigoNative as unknown as DetectedBanksApi

interface Props {
  config: CaptureConfig
  onConfig: (next: CaptureConfig) => Promise<void>
  onToast: Notify
  /** Cierra la hoja; `choose` = la persona quiere elegir la app a mano en Avanzado */
  onClose: (choose?: boolean) => void
}

const RESTRICTED = [
  'Abre «Información de la app» de Contigo.',
  'Toca los tres puntos y elige «Permitir ajustes restringidos».',
  'Vuelve y activa el acceso a las notificaciones.',
]

/** «¿Conectar tus bancos?»: Aceptar → permiso → bancos encontrados → guardar solos. Corto y reversible. */
export default function BankConsentSheet({ config, onConfig, onToast, onClose }: Props) {
  const { state, reload } = useCaptureStatus()
  useEffect(() => {
    setUpdateSuppressed(true)
    return () => setUpdateSuppressed(false)
  }, [])
  const [step, setStep] = useState<ConsentStep>('ask')
  const [banks, setBanks] = useState<DetectedBank[]>([])
  const [auto, setAuto] = useState(true)
  const [again, setAgain] = useState(false)
  const allowed = state.kind === 'ready' && state.status.listenerAllowed
  const restricted = state.kind === 'ready' && state.status.restrictedSettingsLikely

  // El acceso se concede en los ajustes del sistema: al confirmarse se sigue sola
  useEffect(() => {
    if (step !== 'permission' || !allowed) return
    const t = window.setTimeout(() => setStep((s) => consentNext(s, { type: 'checked', permission: true })), 0)
    return () => window.clearTimeout(t)
  }, [step, allowed])

  useEffect(() => {
    if (step !== 'detecting') return
    let live = true
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const found = parseDetectedBanks(await api.getDetectedBanks())
          if (found.length > 0) {
            await api.enableAllDetected()
            const saved = [...new Set([...config.savedPackages, ...found.map((b) => b.packageName)])]
            await onConfig({ ...config, enabled: true, mode: 'AUTO', savedPackages: saved })
          }
          if (!live) return
          setBanks(found)
          setAuto(true)
          setStep((s) => consentNext(s, { type: 'detected', count: found.length }))
        } catch (e) {
          logError(e, 'BankConsentSheet')
          if (live) setStep((s) => consentNext(s, { type: 'failed' }))
        }
      })()
    }, 0)
    return () => {
      live = false
      window.clearTimeout(t)
    }
    // Una sola pasada por entrada al paso: la configuración se lee tal como está en ese momento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function accept() {
    writeConsent('accepted')
    setStep(consentNext(step, { type: 'accept', permission: allowed }))
  }
  function decline() {
    writeConsent('declined')
    onClose()
  }
  async function confirmed() {
    await reload()
    setAgain(true)
  }
  async function toggleAuto() {
    const next = !auto
    setAuto(next)
    try {
      await api.setAutoSaveAll({ enabled: next })
      await onConfig({ ...config, mode: next ? 'AUTO' : 'CONFIRM', enabled: true, savedPackages: [...new Set([...config.savedPackages, ...banks.map((b) => b.packageName)])] })
    } catch (e) {
      logError(e, 'BankConsentSheet')
      setAuto(!next)
      onToast(pluginErrorText(e) ?? 'No se pudo guardar el cambio\nInténtalo de nuevo.', 'error')
    }
  }
  function finish() {
    void rescanNow({ force: true })
    if (banks.length > 0 && auto) onToast(activatedMessage(banks))
    onClose()
  }

  return (
    <Modal onClose={step === 'ask' ? decline : finish} label="Conectar tus bancos">
      <div className="stack picker">
        {step === 'ask' && (
          <>
            <h2 className="perm-title">¿Conectar tus bancos?</h2>
            <p>Leemos solo los avisos de gasto de tus apps de banco, en tu teléfono.</p>
            <p className="muted">{CAPTURE_AVAILABLE_TEXT}</p>
            <p className="muted">El texto no sale del teléfono.</p>
            <button type="button" className="btn" onClick={accept}>
              Aceptar
            </button>
            <button type="button" className="btn ghost" onClick={decline}>
              Ahora no
            </button>
          </>
        )}

        {step === 'permission' && (
          <>
            <h2 className="perm-title">Activa el acceso a los avisos</h2>
            <ol className="install-steps">
              <li>Toca «Abrir ajustes».</li>
              <li>Busca Contigo y activa el acceso.</li>
              <li>Vuelve aquí y toca «Ya lo hice».</li>
            </ol>
            {restricted && (
              <div className="explain">
                <strong>¿El interruptor está gris?</strong>
                <ol className="install-steps">{RESTRICTED.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
            )}
            {again && !allowed && (
              <p role="alert" className="over">
                Todavía no está activo.
              </p>
            )}
            <button type="button" className="btn" onClick={() => void ContigoNative.openPermissionGuide().catch((e: unknown) => logError(e, 'BankConsentSheet'))}>
              Abrir ajustes
            </button>
            <button type="button" className="btn ghost" onClick={() => void confirmed()}>
              Ya lo hice
            </button>
          </>
        )}

        {step === 'detecting' && <SkeletonCard lines={2} label="Buscando tus bancos…" />}

        {step === 'result' && (
          <>
            <h2 className="perm-title">{foundLine(banks)}</h2>
            <ul className="chips" aria-label="Bancos encontrados">
              {banks.map((b) => (
                <li key={b.id} className="chip">
                  {b.name}
                </li>
              ))}
            </ul>
            <div className="row between">
              <strong id="consent-auto">Guardar solos mis gastos</strong>
              <button type="button" role="switch" className="switch" aria-checked={auto} aria-labelledby="consent-auto" onClick={() => void toggleAuto()} />
            </div>
            <p className="muted small-text">Siempre puedes deshacer.</p>
            <button type="button" className="btn" onClick={finish}>
              Listo
            </button>
          </>
        )}

        {step === 'none' && (
          <>
            <h2 className="perm-title">No encontramos bancos</h2>
            <p className="muted">No vimos apps de bancos conocidos en este teléfono.</p>
            <p className="muted small-text">{CAPTURE_AVAILABLE_TEXT}</p>
            <button type="button" className="btn" onClick={() => onClose(true)}>
              Elegir app a mano
            </button>
            <button type="button" className="btn ghost" onClick={() => onClose()}>
              Cerrar
            </button>
          </>
        )}

        {step === 'error' && (
          <>
            <h2 className="perm-title">No pudimos revisar</h2>
            <p role="alert" className="muted">
              Es algo del teléfono, no de tu cuenta. Inténtalo de nuevo.
            </p>
            <button type="button" className="btn" onClick={() => setStep(consentNext(step, { type: 'retry' }))}>
              Reintentar
            </button>
            <button type="button" className="btn ghost" onClick={() => onClose()}>
              Cerrar
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
