// Copyright (c) 2026 Dinovance
import { SkeletonCard } from './Skeleton'
import { syncSummary } from '../lib/bankAuto'
import type { SyncState } from '../lib/bankAuto'

/** Estado del envío de gastos al servidor y cuántos faltan. */
export default function SyncStatus({ state, onSend }: { state: SyncState | null; onSend: () => void }) {
  if (state === null) return <SkeletonCard lines={1} label="Leyendo el estado del envío…" />
  const text = syncSummary(state)
  return (
    <section className="card" aria-label="Envío de gastos">
      <strong>Envío de gastos</strong>
      <span role={state.state === 'error' ? 'alert' : 'status'}>{text}</span>
      {state.lastSyncAt && <span className="muted small-text">Último envío: {new Date(state.lastSyncAt).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
      {state.pending > 0 && state.state !== 'syncing' && (
        <button type="button" className="btn small" onClick={onSend}>
          Enviar ahora
        </button>
      )}
    </section>
  )
}
