// Copyright (c) 2026 Dinovance
import type { CSSProperties } from 'react'

/** Bloque gris que pulsa suavemente mientras carga el contenido (se detiene con «reducir movimiento»). */
export function Skeleton({ w = '100%', h = 14, round = false }: { w?: CSSProperties['width']; h?: number; round?: boolean }) {
  return <span className={round ? 'skel round' : 'skel'} style={{ width: w, height: h }} aria-hidden="true" />
}

/** Aviso para lectores de pantalla: lo visual es decorativo */
function Busy({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>
}

export function SkeletonCard({ lines = 3, label = 'Cargando…' }: { lines?: number; label?: string }) {
  return (
    <div className="card skel-card" role="status" aria-busy="true">
      <Busy label={label} />
      <Skeleton w="45%" h={18} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={i === lines - 1 ? '70%' : '100%'} />
      ))}
    </div>
  )
}

export function SkeletonList({ rows = 5, label = 'Cargando la lista…' }: { rows?: number; label?: string }) {
  return (
    <div className="card" role="status" aria-busy="true">
      <Busy label={label} />
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-row" key={i}>
          <Skeleton w={40} h={40} round />
          <div className="skel-col">
            <Skeleton w="60%" />
            <Skeleton w="35%" h={12} />
          </div>
          <Skeleton w={56} h={16} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ label = 'Cargando el gráfico…' }: { label?: string }) {
  return (
    <div className="card" role="status" aria-busy="true">
      <Busy label={label} />
      <Skeleton w="40%" h={18} />
      <div className="skel-bars" aria-hidden="true">
        {[40, 70, 55, 90, 60, 80, 45].map((h, i) => (
          <span key={i} className="skel" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

/** Pantalla completa mientras cargan los datos: título, una tarjeta y una lista. Nunca una pantalla en blanco. */
export function SkeletonScreen() {
  return (
    <main className="screen" aria-busy="true">
      <Skeleton w="50%" h={28} />
      <SkeletonCard />
      <SkeletonChart />
      <SkeletonList rows={4} />
    </main>
  )
}
