// Copyright (c) 2026 Dinovance
import { useEffect, useState } from 'react'
import { SkeletonCard } from './Skeleton'
import type { Notify } from './Toast'
import { parseDiagnostics } from '../lib/bankConsent'
import type { DetectedBanksApi, DiagnosticItem } from '../lib/bankConsent'
import { ContigoNative } from '../lib/nativeBridge'

const api = ContigoNative as unknown as DetectedBanksApi
type State = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ready'; items: DiagnosticItem[] }

/** «Avisos que no pude leer»: motivo en palabras simples y «Copiar aviso» (texto ya enmascarado; nada se envía solo) */
export default function CaptureDiagnostics({ onToast }: { onToast: Notify }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    api
      .getCaptureDiagnostics()
      .then((r) => live && setState({ kind: 'ready', items: parseDiagnostics(r) }))
      .catch(() => live && setState({ kind: 'unavailable' }))
    return () => {
      live = false
    }
  }, [])

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
      {state.kind === 'unavailable' && <span className="muted small-text">Esta versión de la app todavía no muestra esto.</span>}
      {state.kind === 'ready' && state.items.length === 0 && <span className="muted small-text">No hay avisos sin leer.</span>}
      {state.kind === 'ready' && (
        <ul className="stack tight">
          {state.items.map((it, i) => (
            <li key={i} className="row between">
              <span>{it.reason}</span>
              {it.masked && (
                <button type="button" className="btn ghost small" onClick={() => void copy(it.masked as string)}>
                  Copiar aviso
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
