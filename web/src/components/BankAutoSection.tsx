// Copyright (c) 2026 Dinovance
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import BankCard from './BankCard'
import Modal from './Modal'
import { SkeletonCard } from './Skeleton'
import SyncStatus from './SyncStatus'
import type { Notify } from './Toast'
import { parseBankPresets, parseSyncState, parseThreshold } from '../lib/bankAuto'
import type { BankAutoApi, BankPreset, SyncState } from '../lib/bankAuto'
import { MAX_CAP_CLP, MIN_CAP_CLP } from '../lib/captureConfig'
import type { CaptureConfig } from '../lib/captureConfig'
import { ContigoNative, readRecentApps } from '../lib/nativeBridge'
import type { NotifyingApp } from '../lib/nativeBridge'
import { logError } from '../lib/safeLog'

// El contrato de estos métodos lo documenta el backend; hasta entonces se usa por tipos (ver lib/bankAuto.ts)
const api = ContigoNative as unknown as BankAutoApi

type Load = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ready'; banks: BankPreset[]; sync: SyncState }

interface Props {
  config: CaptureConfig
  onConfig: (next: CaptureConfig) => Promise<void>
  onToast: Notify
  onSendNow: () => Promise<void>
}

/** Guardado automático por banco, tope editable y estado del envío. */
export default function BankAutoSection({ config, onConfig, onToast, onSendNow }: Props) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState<BankPreset | null>(null)
  const [apps, setApps] = useState<NotifyingApp[] | null>(null)
  const [capText, setCapText] = useState(String(config.maxClp))
  const [capError, setCapError] = useState<string | null>(null)

  const read = useCallback(async () => {
    try {
      const [presets, sync] = await Promise.all([api.getBankPresets(), api.getSyncState()])
      setLoad({ kind: 'ready', banks: parseBankPresets(presets), sync: parseSyncState(sync) })
    } catch {
      // Una versión de la app sin estas funciones responde con error: se explica en vez de mostrar tarjetas que no funcionan
      setLoad({ kind: 'unavailable' })
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => void read(), 0)
    return () => window.clearTimeout(t)
  }, [read])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      await read()
    } catch (e) {
      logError(e, 'BankAutoSection')
      onToast('No se pudo guardar el cambio\nInténtalo de nuevo.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function openPicker(bank: BankPreset) {
    setPicking(bank)
    setApps(null)
    try {
      setApps(await readRecentApps(ContigoNative))
    } catch (e) {
      logError(e, 'BankAutoSection')
      setApps([])
    }
  }

  async function saveCap(e: FormEvent) {
    e.preventDefault()
    const r = parseThreshold(capText)
    if (!r.ok || r.value < MIN_CAP_CLP || r.value > MAX_CAP_CLP) {
      setCapError(r.ok ? `El tope debe estar entre ${MIN_CAP_CLP.toLocaleString('es-CL')} y ${MAX_CAP_CLP.toLocaleString('es-CL')} pesos.` : r.error)
      return
    }
    setCapError(null)
    await run(async () => {
      await api.setAutoCap({ maxClp: r.value })
      await onConfig({ ...config, maxClp: r.value })
    })
  }

  if (load.kind === 'loading') return <SkeletonCard lines={4} label="Leyendo los bancos…" />
  if (load.kind === 'unavailable') {
    return (
      <section className="card" role="note">
        <strong>Guardado automático por banco</strong>
        <span className="muted">Esta versión de la app todavía no incluye el guardado automático para Santander, Banco Estado, Banco Falabella y Banco de Chile. Actualiza Contigo para usarlo.</span>
      </section>
    )
  }
  return (
    <div className="stack">
      <h3 className="perm-title">Guardado automático por banco</h3>
      {load.banks.map((b) => (
        <BankCard key={b.id} bank={b} cap={config.maxClp} busy={busy} onToggle={(enabled) => void run(() => api.setBankAutoSave({ bankId: b.id, enabled }))} onAssociate={() => void openPicker(b)} onDissociate={() => void run(() => api.setBankPackage({ bankId: b.id, packageName: null }))} />
      ))}

      <form className="card field" onSubmit={(e) => void saveCap(e)}>
        <label htmlFor="auto-cap">Tope para guardar solo (pesos)</label>
        <input id="auto-cap" className="input" inputMode="numeric" autoComplete="off" value={capText} aria-invalid={capError !== null} aria-describedby={capError ? 'auto-cap-err' : 'auto-cap-help'} onChange={(e) => setCapText(e.target.value)} />
        <span id="auto-cap-help" className="line-help">
          Lo que supere este monto siempre te lo preguntamos.
        </span>
        {capError && (
          <span id="auto-cap-err" className="error" role="alert">
            {capError}
          </span>
        )}
        <button type="submit" className="btn small" disabled={busy}>
          Guardar tope
        </button>
      </form>

      <SyncStatus state={load.sync} onSend={() => void onSendNow().then(read)} />

      {picking && (
        <Modal onClose={() => setPicking(null)} label={`Asociar la app de ${picking.name}`}>
          <div className="stack picker">
            <h2 className="perm-title">Elige la app de {picking.name}</h2>
            <p className="muted small-text">Mostramos las apps que mandaron avisos hace poco, solo su nombre. Haz un pago con tu banco si no la ves.</p>
            {apps === null && <SkeletonCard lines={3} label="Buscando apps…" />}
            {apps?.length === 0 && <p role="status">No vimos apps con avisos todavía.</p>}
            {apps?.map((a) => (
              <button
                key={a.packageName}
                type="button"
                className="btn ghost"
                onClick={() => {
                  const bank = picking
                  setPicking(null)
                  void run(() => api.setBankPackage({ bankId: bank.id, packageName: a.packageName }))
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
    </div>
  )
}
