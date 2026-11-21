// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import { checkLicenses, inventoryFromLock, thirdPartyNotice } from '../lib/licenses'
import { logError } from '../lib/safeLog'

interface Summary {
  total: number
  review: number
  notice: string
}

/** El inventario sale de package-lock.json y se carga solo al pedirlo, para no pesar al abrir la app. */
async function loadSummary(): Promise<Summary> {
  const raw = (await import('../../package-lock.json?raw')).default
  const inventory = inventoryFromLock(JSON.parse(raw))
  const report = checkLicenses(inventory)
  return { total: inventory.length, review: report.unknown.length + report.rejected.length, notice: thirdPartyNotice(inventory) }
}

export default function LicensesCard() {
  const [state, setState] = useState<'idle' | 'loading' | 'error' | Summary>('idle')

  async function open() {
    setState('loading')
    try {
      setState(await loadSummary())
    } catch (e) {
      logError(e, 'LicensesCard')
      setState('error')
    }
  }

  return (
    <section className="card" aria-label="Licencias de terceros">
      <strong>Licencias de terceros</strong>
      <span className="muted small-text">Contigo se construye con software de otras personas. Aquí está la lista con su licencia.</span>
      {state === 'idle' && (
        <button type="button" className="btn ghost small" onClick={() => void open()}>
          Ver licencias
        </button>
      )}
      {state === 'loading' && <span role="status">Cargando…</span>}
      {state === 'error' && (
        <span role="alert" className="error">
          No se pudo cargar la lista. Inténtalo de nuevo.
        </span>
      )}
      {typeof state === 'object' && (
        <>
          <span className="small-text">
            {state.total} paquetes
            {state.review > 0 ? `; ${state.review} sin licencia declarada o por revisar` : '; todos con licencia permisiva'}.
          </span>
          <pre className="license-list" tabIndex={0} aria-label="Lista de licencias de terceros">
            {state.notice}
          </pre>
        </>
      )}
    </section>
  )
}
