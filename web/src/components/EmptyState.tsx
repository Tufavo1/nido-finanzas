// Copyright (c) 2026 Dinovance
import type { ReactNode } from 'react'
import Logo from './Logo'
import { emptyState } from '../lib/screenState'
import type { EmptySection } from '../lib/screenState'

interface Props {
  section: EmptySection
  /** Cuántos elementos tiene la lista; si hay alguno no se muestra nada */
  count: number
  onCta: (target: 'register' | 'goals' | 'money' | 'settings') => void
  /** Reemplaza el botón de la guía (una sola acción por estado vacío) */
  action?: ReactNode
}

/** Estado vacío con una guía del primer paso (los textos viven en lib/screenState). */
export default function EmptyState({ section, count, onCta, action }: Props) {
  const spec = emptyState(section, count)
  if (!spec) return null
  return (
    <section className="card empty" aria-label={spec.title}>
      <Logo size={40} />
      <strong>{spec.title}</strong>
      <p className="muted">{spec.hint}</p>
      {action ?? (
        <button type="button" className="btn small" onClick={() => onCta(spec.cta.target)}>
          {spec.cta.label}
        </button>
      )}
    </section>
  )
}
