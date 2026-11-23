// Copyright (c) 2026 Dinovance
import { useEffect, useState } from 'react'
import AmountChoices from './AmountChoices'
import { SkeletonCard } from './Skeleton'
import type { Notify } from './Toast'
import { NotAvailableError, partnerAlertStore } from '../lib/partnerAlerts'
import type { PartnerAlertPref, PartnerAlertStore } from '../lib/partnerAlerts'
import { clpLabel } from '../lib/nativeSettings'
import { logError } from '../lib/safeLog'

type State = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'error' } | { kind: 'ready'; pref: PartnerAlertPref }

/** «Avisarme de los gastos de mi pareja»: un interruptor y, si está encendido, desde qué monto. */
export default function PartnerAlertSwitch({ hasPartner, onToast, store = partnerAlertStore }: { hasPartner: boolean; onToast: Notify; store?: PartnerAlertStore }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!hasPartner) return
    let live = true
    store
      .load()
      .then((pref) => live && setState({ kind: 'ready', pref }))
      .catch((e: unknown) => {
        if (!live) return
        if (!(e instanceof NotAvailableError)) logError(e, 'PartnerAlertSwitch')
        setState({ kind: e instanceof NotAvailableError ? 'unavailable' : 'error' })
      })
    return () => {
      live = false
    }
  }, [store, hasPartner])

  async function save(pref: PartnerAlertPref) {
    try {
      await store.save(pref)
      setState({ kind: 'ready', pref })
    } catch (e) {
      if (e instanceof NotAvailableError) {
        setState({ kind: 'unavailable' })
        return
      }
      logError(e, 'PartnerAlertSwitch')
      onToast('No se pudo guardar\nInténtalo de nuevo.', 'error', { label: 'Reintentar', onAction: () => void save(pref) })
    }
  }

  if (!hasPartner) {
    return (
      <section className="card">
        <strong>Avisarme de los gastos de mi pareja</strong>
        <span className="muted small-text">Disponible cuando sumes a tu pareja.</span>
      </section>
    )
  }
  if (state.kind === 'loading') return <SkeletonCard lines={2} label="Cargando tus avisos…" />
  if (state.kind === 'unavailable') {
    return (
      <section className="card" role="note">
        <strong>Avisarme de los gastos de mi pareja</strong>
        <span className="muted small-text">Todavía no está disponible en tu cuenta. Tus demás ajustes siguen funcionando.</span>
      </section>
    )
  }
  if (state.kind === 'error') {
    return (
      <section className="card" role="alert">
        <strong>No pudimos leer este aviso</strong>
        <span className="muted small-text">Revisa tu conexión e inténtalo de nuevo.</span>
      </section>
    )
  }
  const { pref } = state
  return (
    <section className="card" aria-labelledby="pa-sw-title">
      <div className="row between tap" onClick={() => void save({ ...pref, enabled: !pref.enabled })}>
        <div className="stack tight">
          <strong id="pa-sw-title">Avisarme de los gastos de mi pareja</strong>
          <span className="muted small-text" id="pa-sw-sum">
            {pref.enabled ? `Activado · desde ${clpLabel(pref.thresholdClp)}` : 'Apagado'}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={pref.enabled}
          aria-labelledby="pa-sw-title"
          aria-describedby="pa-sw-sum"
          onClick={(e) => {
            e.stopPropagation()
            void save({ ...pref, enabled: !pref.enabled })
          }}
        />
      </div>
      {pref.enabled && (
        <div className="stack tight">
          <span className="muted small-text">Te aviso cuando anote un gasto de este monto o más:</span>
          <AmountChoices label="Avisarme desde este monto" value={pref.thresholdClp} onPick={(n) => void save({ ...pref, thresholdClp: n })} />
        </div>
      )}
    </section>
  )
}
