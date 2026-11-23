// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import Spin from './Spin'
import { describeScan, SCAN_FAILED } from '../lib/scanOutcome'
import type { ScanOutcome } from '../lib/scanOutcome'
import type { RescanResult } from '../lib/nativeBridge'
import { ContigoNative, isNativeApp } from '../lib/nativeBridge'
import { scanNow } from '../lib/rescan'
import { logError } from '../lib/safeLog'

interface ViewProps {
  busy: boolean
  outcome: ScanOutcome | null
  onScan: () => void
  onAction: (a: 'access' | 'pick-app') => void
}

/** Solo la vista: un botón principal ancho, el resultado en una frase (se queda hasta la próxima búsqueda) y su acción. */
export function ScanView({ busy, outcome, onScan, onAction }: ViewProps) {
  return (
    <div className="stack tight scan">
      <button type="button" className="btn scan-btn" disabled={busy} aria-busy={busy} onClick={onScan}>
        {busy ? <Spin label="Buscando…" /> : 'Buscar gastos ahora'}
      </button>
      <div role="status" className="scan-result">
        {outcome && (
          <>
            <span className={outcome.kind === 'problem' ? 'strong' : undefined}>{outcome.text}</span>
            {outcome.action && (
              <button type="button" className="btn ghost small" onClick={() => onAction(outcome.action!.type)}>
                {outcome.action.label}
              </button>
            )}
            {outcome.hint && (
              <span className="muted small-text">
                {outcome.hint.text}{' '}
                <button type="button" className="link-btn" onClick={() => onAction('pick-app')}>
                  {outcome.hint.label}
                </button>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface Props {
  /** Lleva a Avanzado / selector de apps */
  onPickApp: () => void
  /** Solo pruebas */
  scan?: () => Promise<RescanResult | null>
  native?: boolean
}

/** «Buscar gastos ahora»: relee los avisos del teléfono cuando la persona lo pide. Solo en la app nativa. */
export default function ScanButton({ onPickApp, scan = scanNow, native = isNativeApp() }: Props) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null)
  if (!native) return null

  async function run() {
    if (busy) return
    setBusy(true)
    try {
      const r = await scan()
      setOutcome(r ? describeScan(r) : { kind: 'problem', text: SCAN_FAILED })
    } finally {
      setBusy(false)
    }
  }
  function act(a: 'access' | 'pick-app') {
    if (a === 'pick-app') onPickApp()
    else void ContigoNative.openPermissionGuide().catch((e: unknown) => logError(e, 'ScanButton'))
  }
  return <ScanView busy={busy} outcome={outcome} onScan={() => void run()} onAction={act} />
}
