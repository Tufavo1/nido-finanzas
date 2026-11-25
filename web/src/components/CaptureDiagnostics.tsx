// Copyright (c) 2026 Dinovance
import { useEffect, useState } from 'react'
import { SkeletonCard } from './Skeleton'
import type { Notify } from './Toast'
import { parseDiagnostics } from '../lib/bankConsent'
import type { DetectedBanksApi, DiagnosticItem } from '../lib/bankConsent'
import { ContigoNative } from '../lib/nativeBridge'
import ClearAllNotices from './ClearAllNotices'
import { useClearNotices } from '../lib/useClearNotices'
import { DeadlineError, DIAGNOSTICS_DEADLINE_MS, withDeadline } from '../lib/deadline'

const api = ContigoNative as unknown as DetectedBanksApi
type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'unavailable' } | { kind: 'ready'; items: DiagnosticItem[] }

/** «Avisos que no pude leer»: motivo en palabras simples y «Copiar aviso» (texto ya enmascarado; nada se envía solo) */
export default function CaptureDiagnostics({ onToast }: { onToast: Notify }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    // Si el teléfono no responde en unos segundos, se avisa y se ofrece Reintentar (no se deja cargando)
    withDeadline(api.getCaptureDiagnostics(), DIAGNOSTICS_DEADLINE_MS)
      .then((r) => live && setState({ kind: 'ready', items: parseDiagnostics(r) }))
      .catch((e: unknown) => live && setState({ kind: e instanceof DeadlineError ? 'failed' : 'unavailable' }))
    return () => {
      live = false
    }
  }, [attempt])

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  const clearNotices = useClearNotices(ContigoNative, onToast, retry)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      onToast('Copiado\nPuedes pegarlo donde quieras compartirlo.')
    } catch {
      onToast('No se pudo copiar\nInténtalo de nuevo.', 'error')
    }
  }

  if (state.kind === 'loading') return <SkeletonCard lines={2} label="Buscando avisos…" />
  return (
    <section className="card" aria-label="Avisos que no pude leer">
      <strong>Avisos que no pude leer</strong>
      {state.kind === 'failed' && (
        <>
          <span className="muted small-text">No pude cargar los avisos. Revisa que Contigo tenga acceso a las notificaciones e inténtalo de nuevo.</span>
          <button type="button" className="btn ghost small" onClick={retry}>
            Reintentar
          </button>
        </>
      )}
      {state.kind === 'unavailable' && <span className="muted small-text">Esta versión de la app todavía no muestra esto.</span>}
      {state.kind === 'ready' && state.items.length === 0 && <span className="muted small-text">No hay avisos sin leer.</span>}
      {state.kind === 'ready' && (
        <ul className="stack tight">
          {state.items.map((it, i) => (
            <li key={i} className="row between">
              <span>{it.reason}</span>
              <div className="row">
                {it.masked && (
                  <button type="button" className="btn ghost small" onClick={() => void copy(it.masked as string)}>
                    Copiar aviso
                  </button>
                )}
                {it.at !== null && (
                  <button type="button" className="btn ghost small" onClick={() => void clearNotices(it.at as number)}>
                    Borrar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.kind === 'ready' && state.items.length > 0 && <ClearAllNotices onClear={() => void clearNotices()} />}
    </section>
  )
}
