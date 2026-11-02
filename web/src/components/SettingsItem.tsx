import type { ReactNode } from 'react'
import Icon from './Icon'
import type { IconName } from './Icon'

interface Props {
  id: string
  icon: IconName
  title: string
  /** Una línea que resume el estado sin abrirlo */
  summary?: string
  open: boolean
  onToggle: (id: string) => void
  tone?: 'default' | 'danger'
  /** Si se da, la fila no se despliega: lleva a otra pantalla */
  onGo?: () => void
  children?: ReactNode
}

/** Una fila de ajustes que se despliega en su lugar, como un acordeón */
export default function SettingsItem({ id, icon, title, summary, open, onToggle, tone = 'default', onGo, children }: Props) {
  const go = onGo !== undefined
  return (
    <div className={`set-item${open && !go ? ' open' : ''}${tone === 'danger' ? ' danger' : ''}`}>
      <h2 className="set-head">
        <button
          type="button"
          id={`set-btn-${id}`}
          {...(go ? {} : { 'aria-expanded': open, 'aria-controls': `set-panel-${id}` })}
          onClick={() => (go ? onGo() : onToggle(id))}
        >
          <span className="set-icon" aria-hidden="true">
            <Icon name={icon} size={20} />
          </span>
          <span className="set-title">
            <span className="strong">{title}</span>
            {summary && <span className="muted small-text">{summary}</span>}
          </span>
          <span className="set-chev" aria-hidden="true">
            <Icon name={go ? 'chevR' : 'chevD'} size={20} />
          </span>
        </button>
      </h2>
      {open && !go && (
        <div className="set-body" id={`set-panel-${id}`} role="region" aria-labelledby={`set-btn-${id}`}>
          {children}
        </div>
      )}
    </div>
  )
}
