// Copyright (c) 2026 Dinovance
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { SkeletonCard } from './Skeleton'
import type { Notify } from './Toast'
import { parseThreshold } from '../lib/bankAuto'
import { DEFAULT_PARTNER_ALERT, NotAvailableError, partnerAlertStore } from '../lib/partnerAlerts'
import type { PartnerAlertPref, PartnerAlertStore } from '../lib/partnerAlerts'
import { logError } from '../lib/safeLog'

type State = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'error' } | { kind: 'ready'; pref: PartnerAlertPref }

interface Props {
  onToast: Notify
  store?: PartnerAlertStore
}

/** «Avisos de mi pareja»: te avisamos cuando tu pareja anota un gasto mayor al monto que elijas. */
export default function PartnerAlerts({ onToast, store = partnerAlertStore }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [text, setText] = useState(String(DEFAULT_PARTNER_ALERT.thresholdClp))
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    store
      .load()
      .then((pref) => {
        if (!live) return
        setText(String(pref.thresholdClp))
        setState({ kind: 'ready', pref })
      })
      .catch((e: unknown) => {
        if (!live) return
        if (!(e instanceof NotAvailableError)) logError(e, 'PartnerAlerts')
        setState({ kind: e instanceof NotAvailableError ? 'unavailable' : 'error' })
      })
    return () => {
      live = false
    }
  }, [store])

  async function save(pref: PartnerAlertPref) {
    try {
      await store.save(pref)
      setState({ kind: 'ready', pref })
      onToast('Guardado\nTu preferencia de avisos quedó guardada.', 'success')
    } catch (e) {
      if (e instanceof NotAvailableError) {
        setState({ kind: 'unavailable' })
        onToast('Todavía no está activada\nFalta una actualización del servicio.', 'warn')
        return
      }
      logError(e, 'PartnerAlerts')
      onToast('No se pudo guardar\nInténtalo de nuevo.', 'error', { label: 'Reintentar', onAction: () => void save(pref) })
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (state.kind !== 'ready') return
    const r = parseThreshold(text)
    if (!r.ok) {
      setFieldError(r.error)
      return
    }
    setFieldError(null)
    void save({ ...state.pref, thresholdClp: r.value })
  }

  if (state.kind === 'loading') return <SkeletonCard lines={3} label="Cargando tus avisos…" />
  if (state.kind === 'unavailable') {
    return (
      <section className="card" role="note">
        <strong>Avisos de mi pareja</strong>
        <span className="muted">Esta función todavía no está activada en tu cuenta: falta una actualización del servicio. Tus demás ajustes siguen funcionando.</span>
      </section>
    )
  }
  if (state.kind === 'error') {
    return (
      <section className="card" role="alert">
        <strong>No pudimos leer tus avisos</strong>
        <span className="muted">Revisa tu conexión e inténtalo de nuevo.</span>
      </section>
    )
  }
  const { pref } = state
  return (
    <section className="card" aria-labelledby="pa-title">
      <div className="row between">
        <div className="stack tight">
          <strong id="pa-title">Avisarme cuando mi pareja haga un gasto mayor</strong>
          <span className="muted small-text">Te mandamos una notificación cuando tu pareja anota un gasto que supera el monto que elijas.</span>
        </div>
        <button type="button" role="switch" className="switch" aria-checked={pref.enabled} aria-labelledby="pa-title" onClick={() => void save({ ...pref, enabled: !pref.enabled })} />
      </div>
      <form className="field" onSubmit={submit}>
        <label htmlFor="pa-limit">Avisarme desde (pesos)</label>
        <input id="pa-limit" className="input" inputMode="numeric" autoComplete="off" value={text} aria-invalid={fieldError !== null} aria-describedby={fieldError ? 'pa-err' : undefined} onChange={(e) => setText(e.target.value)} />
        {fieldError && (
          <span id="pa-err" className="error" role="alert">
            {fieldError}
          </span>
        )}
        <button type="submit" className="btn small">
          Guardar monto
        </button>
      </form>
    </section>
  )
}
