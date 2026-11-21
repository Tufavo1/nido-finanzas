// Copyright (c) 2026 Dinovance
import type { PullView } from '../lib/pull'

/** Texto y barra que aparecen arriba mientras se desliza para actualizar */
export default function PullIndicator({ view, refreshing }: { view: PullView; refreshing: boolean }) {
  if (!refreshing && view.distance === 0) return null
  return (
    <div className="pull" role="status" style={{ transform: `translate(-50%, ${refreshing ? 16 : view.distance - 40}px)` }}>
      {refreshing ? 'Actualizando…' : view.ready ? 'Suelta para actualizar' : 'Desliza para actualizar'}
    </div>
  )
}
