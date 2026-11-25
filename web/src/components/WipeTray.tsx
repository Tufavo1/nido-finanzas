// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import { wipeTrayQuestion } from '../lib/wipeTray'

interface ViewProps {
  count: number
  /** Guardados en la notificación que aún no se envían: no se borran */
  saved: number
  armed: boolean
  busy?: boolean
  onArm: () => void | Promise<void>
  onCancel: () => void
  onConfirm: () => void
}

/** Tarjeta aparte de «Borrar todos» (avisos): esta borra los movimientos pendientes de confirmar */
export function WipeTrayView({ count, saved, armed, busy = false, onArm, onCancel, onConfirm }: ViewProps) {
  if (count <= 0) return null
  return (
    <section className="card wipe-tray" aria-labelledby="wipe-tray-title">
      <strong id="wipe-tray-title">Movimientos pendientes</strong>
      <span className="muted small-text">Quita de este teléfono los gastos detectados que aún no confirmaste. Lo que ya guardaste no se toca.</span>
      {armed ? (
        <>
          <p role="alert">{wipeTrayQuestion(count, saved)}</p>
          <button type="button" className="btn danger" disabled={busy} onClick={onConfirm}>
            Toca otra vez para vaciar
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancelar
          </button>
        </>
      ) : (
        <button type="button" className="btn danger" disabled={busy} onClick={onArm}>
          Vaciar movimientos pendientes
        </button>
      )}
    </section>
  )
}

/** «Vaciar movimientos pendientes» en dos toques, igual que «Borrar todos»: el primero muestra cuántos se borran y pide confirmar */
export default function WipeTray({ count, saved, onWipe, onBeforeArm }: { count: number; saved: number; onWipe: () => void; onBeforeArm?: () => Promise<void> }) {
  const [armed, setArmed] = useState(false)
  return (
    <WipeTrayView
      count={count}
      saved={saved}
      armed={armed}
      onArm={async () => {
        // Relee la bandeja justo antes de preguntar: el conteo de guardados pudo cambiar después de abrir la pantalla
        await onBeforeArm?.()
        setArmed(true)
      }}
      onCancel={() => setArmed(false)}
      onConfirm={() => {
        setArmed(false)
        onWipe()
      }}
    />
  )
}
