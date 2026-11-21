// Copyright (c) 2026 Dinovance
import Logo from './Logo'
import Icon from './Icon'
import type { IconName } from './Icon'
import type { ErrorScreen, ScreenSpec } from '../lib/screenState'

const ICON: Record<ErrorScreen, IconName> = {
  offline: 'wifiOff',
  'session-expired': 'lock',
  'no-permission': 'shield',
  'not-found': 'search',
  maintenance: 'tools',
  unexpected: 'alert',
}

interface Props {
  spec: ScreenSpec
  /** Se ejecuta al tocar el botón principal; quien usa la pantalla decide qué significa cada acción */
  onPrimary: () => void
  secondary?: { label: string; onClick: () => void }
}

/** Pantalla de error o de estado: un ícono, qué pasó en una frase y una sola acción clara. */
export default function StatePage({ spec, onPrimary, secondary }: Props) {
  return (
    <div className="splash err-page" role={spec.screen === 'offline' ? 'status' : 'alert'}>
      <Logo size={44} />
      <span className="state-icon" aria-hidden="true">
        <Icon name={ICON[spec.screen]} size={32} />
      </span>
      <h1 className="title">{spec.title}</h1>
      <p className="muted">{spec.detail}</p>
      <div className="err-actions">
        <button className="btn wide" type="button" onClick={onPrimary}>
          {spec.primary.label}
        </button>
        {secondary && (
          <button className="btn ghost wide" type="button" onClick={secondary.onClick}>
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  )
}
