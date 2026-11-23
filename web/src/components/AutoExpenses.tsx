// Copyright (c) 2026 Dinovance
import { useCallback, useEffect, useState } from 'react'
import AmountChoices from './AmountChoices'
import BankConsentSheet from './BankConsentSheet'
import Modal from './Modal'
import ScanButton from './ScanButton'
import { SkeletonCard } from './Skeleton'
import SyncStatus from './SyncStatus'
import type { Notify } from './Toast'
import { BANKS, parseBankPresets, parseSyncState } from '../lib/bankAuto'
import type { BankAutoApi, BankPreset, SyncState } from '../lib/bankAuto'
import { parseDetectedBanks, readConsent, shouldAskConsent } from '../lib/bankConsent'
import type { DetectedBank, DetectedBanksApi } from '../lib/bankConsent'
import { effectivePackages } from '../lib/captureApps'
import { MAX_CAP_CLP, MIN_CAP_CLP } from '../lib/captureConfig'
import type { CaptureConfig } from '../lib/captureConfig'
import { ContigoNative, readRecentApps } from '../lib/nativeBridge'
import type { NotifyingApp } from '../lib/nativeBridge'
import { captureHeadline, clpLabel, openBatterySettings, parseDiagnosticsDetailed, pluginErrorText, readCaptureHealth } from '../lib/nativeSettings'
import type { CaptureHealth, DetailedDiagnostic, Headline, HeadlineAction } from '../lib/nativeSettings'
import { rescanNow } from '../lib/rescan'
import { logError } from '../lib/safeLog'
import { useCaptureStatus } from '../lib/useCaptureStatus'

// Contratos del plugin que ya usan las demás pantallas de captura (ver lib/bankAuto.ts y lib/bankConsent.ts)
const api = ContigoNative as unknown as BankAutoApi & DetectedBanksApi

/** Una línea con el estado y, si hace falta, el botón que lo arregla. */
export function StatusLine({ headline, hint, onAction }: { headline: Headline; hint?: string; onAction: (type: HeadlineAction['type']) => void }) {
  const bad = headline.kind === 'no-access' || headline.kind === 'stalled' || headline.kind === 'battery'
  return (
    <section className="card auto-status" aria-label="Estado de los gastos automáticos">
      <span className={bad ? 'strong over' : 'strong'} role="status">
        {headline.text}
      </span>
      {(headline.note ?? hint) && <span className="muted small-text">{headline.note ?? hint}</span>}
      {headline.action && (
        <button type="button" className="btn" onClick={() => onAction(headline.action!.type)}>
          {headline.action.label}
        </button>
      )}
    </section>
  )
}

/** Primer uso: una sola tarjeta y un solo botón. */
export function FirstUseCard({ onConnect }: { onConnect: () => void }) {
  return (
    <section className="card first-use" aria-labelledby="fu-title">
      <h3 className="perm-title" id="fu-title">
        Anota tus gastos sin escribirlos
      </h3>
      <p className="muted">Contigo lee los avisos de gasto de tu banco, solo en tu teléfono, y los guarda por ti. Nunca lee claves ni mensajes personales.</p>
      <button type="button" className="btn" onClick={onConnect}>
        Conectar mi banco
      </button>
    </section>
  )
}

/** Un banco detectado con su interruptor. */
export function BankSwitchRow({ id, name, on, busy, onChange }: { id: string; name: string; on: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  const label = `auto-bank-${id}`
  return (
    <div className="row between tap auto-row" onClick={() => !busy && onChange(!on)}>
      <div className="stack tight">
        <strong id={label}>{name}</strong>
        <span className="muted small-text" id={`${label}-sum`}>
          {on ? 'Activado · guardo sus gastos' : 'Apagado'}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={on}
        aria-labelledby={label}
        aria-describedby={`${label}-sum`}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          onChange(!on)
        }}
      />
    </div>
  )
}

interface Props {
  config: CaptureConfig
  onConfig: (next: CaptureConfig) => Promise<void>
  onToast: Notify
  /** Después de vaciar la bandeja, para que se actualice la lista de gastos por confirmar */
  onCleared: () => void
  onSendNow: () => Promise<void>
}

const RESTRICTED_HINT = '¿El interruptor sale gris? En «Información de la app» de Contigo, toca los tres puntos y elige «Permitir ajustes restringidos».'

/** Ajustes > Gastos automáticos en la APK: bancos con interruptor, buscar ahora y un solo monto. */
export default function AutoExpenses({ config, onConfig, onToast, onCleared, onSendNow }: Props) {
  const { state, reload } = useCaptureStatus()
  const [detected, setDetected] = useState<DetectedBank[] | null>(null)
  const [presets, setPresets] = useState<BankPreset[] | null>(null)
  const [sync, setSync] = useState<SyncState | null>(null)
  const [health, setHealth] = useState<CaptureHealth | null>(null)
  const [busy, setBusy] = useState(false)
  const [connect, setConnect] = useState(false)
  const [manual, setManual] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [picking, setPicking] = useState<{ id: string; name: string } | null>(null)
  const [apps, setApps] = useState<NotifyingApp[] | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [issues, setIssues] = useState<DetailedDiagnostic[] | null | 'unavailable'>(null)

  const refresh = useCallback(async () => {
    const [d, p, s, h] = await Promise.all([
      api.getDetectedBanks().then(parseDetectedBanks, () => [] as DetectedBank[]),
      api.getBankPresets().then(parseBankPresets, () => null),
      api.getSyncState().then(parseSyncState, () => null),
      readCaptureHealth(ContigoNative),
    ])
    setDetected(d)
    setPresets(p)
    setSync(s)
    setHealth(h)
  }, [])
  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(t)
  }, [refresh])

  const loadIssues = useCallback(() => {
    setIssues(null)
    api.getCaptureDiagnostics().then(
      (r) => setIssues(parseDiagnosticsDetailed(r)),
      () => setIssues('unavailable'),
    )
  }, [])

  if (state.kind === 'loading' || detected === null) return <SkeletonCard lines={4} label="Leyendo el estado de tus gastos automáticos…" />
  if (state.kind === 'web') return null
  if (state.kind === 'error') {
    return (
      <section className="card" role="alert">
        <strong>No pudimos leer el estado</strong>
        <span className="muted">Es algo del teléfono, no de tu cuenta.</span>
        <button type="button" className="btn" onClick={() => void reload()}>
          Reintentar
        </button>
      </section>
    )
  }
  const { status } = state
  const allowed = status.listenerAllowed

  async function guard(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      await reload()
      await refresh()
    } catch (e) {
      logError(e, 'AutoExpenses')
      onToast(pluginErrorText(e) ?? 'No se pudo guardar el cambio\nInténtalo de nuevo.', 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Aplica la preferencia en el teléfono y la guarda */
  async function apply(next: CaptureConfig) {
    await ContigoNative.setAllowedPackages({ packages: effectivePackages(next) })
    await onConfig(next)
  }

  function toggleBank(b: DetectedBank, enabled: boolean) {
    // El primer encendido pasa por el consentimiento y la guía de permisos
    if (enabled && (!allowed || shouldAskConsent(readConsent()))) {
      setConnect(true)
      return
    }
    void guard(async () => {
      const preset = presets?.find((p) => p.id === b.id)
      if (enabled && preset && preset.packageName !== b.packageName) await api.setBankPackage({ bankId: b.id, packageName: b.packageName })
      await api.setBankAutoSave({ bankId: b.id, enabled })
      if (enabled && (config.mode !== 'AUTO' || !config.enabled || !config.savedPackages.includes(b.packageName))) {
        await apply({ ...config, mode: 'AUTO', enabled: true, savedPackages: [...new Set([...config.savedPackages, b.packageName])] })
      }
    })
  }

  const openGuide = () => void ContigoNative.openPermissionGuide().catch((e: unknown) => logError(e, 'AutoExpenses'))
  const activeBanks = detected.filter((b) => presets?.find((p) => p.id === b.id)?.autoSave).map((b) => b.name)
  const headline = captureHeadline({ listenerAllowed: allowed, enabled: config.enabled, revoked: status.revokedSinceConnected, activeBanks, health })
  const onHeadline = (t: HeadlineAction['type']) => {
    if (t === 'access') openGuide()
    else if (t === 'battery') void openBatterySettings(ContigoNative).catch((e: unknown) => logError(e, 'AutoExpenses'))
    else if (t === 'reconnect') void rescanNow({ force: true }).then(() => refresh())
    else void guard(() => apply({ ...config, enabled: true }))
  }

  const sheet = connect && (
    <BankConsentSheet
      config={config}
      onConfig={onConfig}
      onToast={onToast}
      onClose={(choose) => {
        setConnect(false)
        if (choose) {
          setManual(true)
          setAdvanced(true)
        }
        void reload()
        void refresh()
      }}
    />
  )

  // Primer uso: sin bancos conectados, una tarjeta y un botón
  if (detected.length === 0 && !manual) {
    return (
      <>
        <FirstUseCard onConnect={() => setConnect(true)} />
        {sheet}
      </>
    )
  }

  async function openPicker(bank: { id: string; name: string }) {
    setPicking(bank)
    setApps(null)
    try {
      setApps(await readRecentApps(ContigoNative))
    } catch (e) {
      logError(e, 'AutoExpenses')
      setApps([])
    }
  }

  const manualBanks = presets ?? BANKS.map((b) => ({ ...b, packageName: null, autoSave: false }))
  const needsSend = sync !== null && (sync.pending > 0 || sync.state === 'error')

  return (
    <div className="stack">
      <StatusLine headline={headline} hint={headline.kind === 'no-access' && status.restrictedSettingsLikely ? RESTRICTED_HINT : undefined} onAction={onHeadline} />

      {detected.length > 0 && (
        <section className="card" aria-label="Mis bancos">
          {detected.map((b) => (
            <BankSwitchRow key={b.id} id={b.id} name={b.name} on={presets?.find((p) => p.id === b.id)?.autoSave === true} busy={busy} onChange={(v) => toggleBank(b, v)} />
          ))}
        </section>
      )}

      <ScanButton onPickApp={() => setAdvanced(true)} />

      <section className="card" aria-labelledby="auto-cap-title">
        <strong id="auto-cap-title">Guardar solo hasta {clpLabel(config.maxClp)}</strong>
        <span className="muted small-text">Si un gasto pasa de ese monto, te pregunto antes de guardarlo. Los abonos nunca se guardan solos.</span>
        <AmountChoices
          label="Guardar solo hasta este monto"
          value={config.maxClp}
          disabled={busy}
          onPick={(n) => {
            if (n < MIN_CAP_CLP || n > MAX_CAP_CLP) return
            void guard(async () => {
              await api.setAutoCap({ maxClp: n })
              await onConfig({ ...config, maxClp: n })
            })
          }}
        />
      </section>

      {needsSend && <SyncStatus state={sync} onSend={() => void onSendNow().then(refresh)} />}

      <button
        type="button"
        className="btn ghost"
        aria-expanded={advanced}
        aria-controls="auto-advanced"
        onClick={() => {
          if (!advanced) loadIssues()
          setAdvanced(!advanced)
        }}
      >
        {advanced ? 'Ocultar avanzado' : 'Avanzado'}
      </button>

      {advanced && (
        <div className="stack" id="auto-advanced">
          <section className="card" aria-labelledby="auto-manual-title">
            <strong id="auto-manual-title">Si no aparece tu banco</strong>
            <span className="muted small-text">Elige a mano la app de tu banco. Solo mostramos apps que mandaron avisos hace poco: haz un pago con tu banco si no la ves.</span>
            {manualBanks.map((b) => (
              <div className="row between auto-row" key={b.id}>
                <div className="stack tight">
                  <strong>{b.name}</strong>
                  <span className="muted small-text">{b.packageName ? 'Con app elegida' : 'Sin app elegida'}</span>
                </div>
                <div className="row">
                  <button type="button" className="btn ghost small" disabled={busy || presets === null} onClick={() => void openPicker(b)}>
                    Elegir app
                  </button>
                  {b.packageName && (
                    <button type="button" className="btn ghost small" disabled={busy} onClick={() => void guard(() => api.setBankPackage({ bankId: b.id, packageName: null }))}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            ))}
            {presets === null && <span className="muted small-text">Esta versión de la app todavía no permite elegirla a mano. Actualiza Contigo.</span>}
          </section>

          <section className="card" aria-labelledby="auto-issues-title">
            <strong id="auto-issues-title">Avisos que no pude leer</strong>
            {issues === null && <SkeletonCard lines={2} label="Buscando avisos…" />}
            {issues === 'unavailable' && <span className="muted small-text">Esta versión de la app todavía no muestra esto.</span>}
            {Array.isArray(issues) && issues.length === 0 && <span className="muted small-text">No hay avisos sin leer.</span>}
            {Array.isArray(issues) && (
              <ul className="stack tight">
                {issues.map((it, i) => (
                  <li key={i} className="stack tight auto-issue">
                    <strong>{it.reason}</strong>
                    <span className="muted small-text">{it.detail}</span>
                    {it.masked && (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() =>
                          void navigator.clipboard.writeText(it.masked as string).then(
                            () => onToast('Copiado\nPuedes pegarlo donde quieras compartirlo.'),
                            () => onToast('No se pudo copiar\nInténtalo de nuevo.', 'error'),
                          )
                        }
                      >
                        Copiar aviso
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <strong>Vaciar la bandeja</strong>
            <span className="muted small-text">Quita de este teléfono los gastos detectados que aún no confirmaste. Lo que ya guardaste no se toca.</span>
            <button type="button" className="btn danger" onClick={() => setConfirmWipe(true)}>
              Vaciar la bandeja
            </button>
          </section>
        </div>
      )}

      {sheet}

      {picking && (
        <Modal onClose={() => setPicking(null)} label={`Elegir la app de ${picking.name}`}>
          <div className="stack picker">
            <h2 className="perm-title">Elige la app de {picking.name}</h2>
            <p className="muted small-text">Solo mostramos el nombre de las apps que mandaron avisos hace poco.</p>
            {apps === null && <SkeletonCard lines={3} label="Buscando apps…" />}
            {apps?.length === 0 && <p role="status">Todavía no vimos apps con avisos.</p>}
            {apps?.map((a) => (
              <button
                key={a.packageName}
                type="button"
                className="btn ghost"
                onClick={() => {
                  const bank = picking
                  setPicking(null)
                  void guard(() => api.setBankPackage({ bankId: bank.id, packageName: a.packageName }))
                }}
              >
                {a.label}
              </button>
            ))}
            <button type="button" className="btn ghost" onClick={() => setPicking(null)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {confirmWipe && (
        <Modal onClose={() => setConfirmWipe(false)} label="Vaciar la bandeja">
          <div className="stack picker">
            <h2 className="perm-title">¿Vaciar la bandeja?</h2>
            <p className="muted">Se borran los gastos detectados que están esperando en este teléfono.</p>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setConfirmWipe(false)
                ContigoNative.clearCaptured().then(
                  () => {
                    onCleared()
                    onToast('Listo\nSe vació la bandeja de este teléfono.', 'info')
                  },
                  (e: unknown) => {
                    logError(e, 'AutoExpenses')
                    onToast('No se pudo vaciar\nInténtalo de nuevo.', 'error')
                  },
                )
              }}
            >
              Sí, vaciar
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
