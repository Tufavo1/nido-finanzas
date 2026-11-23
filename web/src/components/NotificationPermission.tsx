// Copyright (c) 2026 Dinovance
import { notificationPermissionState } from '../lib/screenState'
import type { NotificationPermission3 } from '../lib/screenState'

interface Props {
  permission: NotificationPermission3
  /** ¿Alguna vez estuvo concedido? Distingue «pendiente» de «revocado» */
  wasGranted: boolean
  /** Abre la pantalla de ajustes del sistema donde se concede el acceso */
  onOpenSystemSettings: () => void
  /** Pide el permiso desde la app (solo cuando aún no se negó) */
  onRequest: () => void
  /** Android 13+: los ajustes restringidos pueden bloquear el acceso aunque se conceda (DEC-05) */
  showRestrictedHelp?: boolean
}

const STEPS = [
  'Toca «Abrir ajustes» más abajo.',
  'Busca Contigo en la lista y activa el acceso a las notificaciones.',
  'Vuelve a Contigo: lo revisamos solos.',
]
const RESTRICTED_STEPS = [
  'Si el interruptor aparece gris, abre «Información de la app» de Contigo.',
  'Toca los tres puntos de arriba y elige «Permitir ajustes restringidos».',
  'Vuelve a activar el acceso a las notificaciones.',
]

/** Pantalla guiada: por qué se pide el acceso, qué NO se guarda y los pasos para activarlo. null si ya está concedido. */
export default function NotificationPermission({ permission, wasGranted, onOpenSystemSettings, onRequest, showRestrictedHelp = false }: Props) {
  const state = notificationPermissionState(permission, wasGranted)
  if (!state) return null
  // Mientras no se haya negado, el sistema deja pedirlo desde la app; después hay que ir a ajustes
  const canAsk = permission === 'default'
  return (
    <section className="card perm" aria-labelledby="perm-title" role={state.screen === 'permission-revoked' ? 'alert' : undefined}>
      <h2 id="perm-title" className="perm-title">
        {state.title}
      </h2>
      <p>{state.detail}</p>
      <ul className="perm-points">
        <li>El texto de tus notificaciones se queda en tu teléfono.</li>
        <li>Solo preparamos el gasto; tú lo confirmas antes de guardarlo.</li>
        <li>Puedes quitar el acceso cuando quieras.</li>
      </ul>
      {!canAsk && <ol className="install-steps">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>}
      {showRestrictedHelp && !canAsk && (
        <div className="explain">
          <strong>¿El interruptor no se deja tocar?</strong>
          <ol className="install-steps">{RESTRICTED_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
      <button type="button" className="btn" onClick={canAsk ? onRequest : onOpenSystemSettings}>
        {canAsk ? 'Activar el acceso' : 'Abrir ajustes'}
      </button>
    </section>
  )
}
