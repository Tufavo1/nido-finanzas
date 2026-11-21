// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import { SkeletonList } from './Skeleton'
import { togglePackage } from '../lib/captureApps'
import { ContigoNative, readRecentApps } from '../lib/nativeBridge'
import type { NotifyingApp } from '../lib/nativeBridge'
import { logError } from '../lib/safeLog'

type Learn = { kind: 'idle' } | { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ready'; apps: NotifyingApp[] }

interface Props {
  selected: string[]
  /** Se llama con la lista nueva; si no se puede guardar, lanza el error */
  onChange: (packages: string[]) => Promise<void>
}

/** Lista blanca de apps y modo aprender: muestra solo nombre y paquete de las apps que mandaron avisos hace poco. */
export default function CaptureAppsPicker({ selected, onChange }: Props) {
  const [learn, setLearn] = useState<Learn>({ kind: 'idle' })

  async function search() {
    setLearn({ kind: 'loading' })
    try {
      setLearn({ kind: 'ready', apps: await readRecentApps(ContigoNative) })
    } catch (e) {
      // Una versión de la app sin esta función responde con error: se explica en vez de mostrar una lista vacía
      logError(e, 'CaptureAppsPicker')
      setLearn({ kind: 'unavailable' })
    }
  }

  return (
    <div className="stack">
      <strong>Apps que se leen</strong>
      {selected.length === 0 ? (
        <span className="muted small-text">Ninguna todavía: mientras no elijas tu banco, no se lee ningún aviso.</span>
      ) : (
        <ul className="chips" aria-label="Apps elegidas">
          {selected.map((p) => (
            <li key={p}>
              <button type="button" className="chip" aria-label={`Quitar ${p}`} onClick={() => void onChange(togglePackage(selected, p))}>
                {p} ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn ghost small" disabled={learn.kind === 'loading'} onClick={() => void search()}>
        Buscar mis bancos
      </button>
      <span className="line-help">Te mostramos las apps que mandaron avisos hace poco, solo su nombre. Nunca el contenido.</span>

      {learn.kind === 'loading' && <SkeletonList rows={3} label="Buscando apps…" />}
      {learn.kind === 'unavailable' && (
        <p className="muted" role="status">
          Esta versión de la app todavía no puede listar las apps con avisos. Actualiza Contigo e inténtalo de nuevo.
        </p>
      )}
      {learn.kind === 'ready' && learn.apps.length === 0 && (
        <p className="muted" role="status">
          No vimos avisos de otras apps todavía. Haz un pago con tu banco y vuelve a buscar.
        </p>
      )}
      {learn.kind === 'ready' && learn.apps.length > 0 && (
        <ul className="app-list">
          {learn.apps.map((a) => (
            <li key={a.packageName}>
              <label className="app-row">
                <input type="checkbox" checked={selected.includes(a.packageName)} onChange={() => void onChange(togglePackage(selected, a.packageName))} />
                <span>
                  <span className="strong">{a.label}</span>
                  <span className="muted small-text">{a.packageName}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
