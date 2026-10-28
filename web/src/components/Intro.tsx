import { useState } from 'react'
import { Rich } from '../lib/rich'
import Icon from './Icon'

interface Props {
  title: string
  text: string
  steps: string[]
  /** Para controlarlo desde fuera (índice de la pestaña Ayuda) */
  open?: boolean
  onToggle?: () => void
  anchor?: string
  /** Texto bajo el título cuando está cerrado */
  hint?: string
}

/** Ayuda de una pestaña de Finanzas, Gastos o Metas: un desplegable con para qué sirve y cómo se usa. */
export default function Intro({ title, text, steps, open: openProp, onToggle, anchor, hint }: Props) {
  // Siempre parte cerrada: es ayuda, no estorba
  const [openOwn, setOpenOwn] = useState(false)
  const open = openProp ?? openOwn
  const toggle = onToggle ?? (() => setOpenOwn((o) => !o))
  const id = anchor ?? `help-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section id={anchor} className={open ? 'card explain help open' : 'card explain help'}>
      <button type="button" className="help-head" aria-expanded={open} aria-controls={id} onClick={toggle}>
        <span className="help-mark" aria-hidden="true">
          <Icon name="info" size={18} />
        </span>
        <span className="help-title">
          <strong>{title}</strong>
          <span className="muted small-text">{open ? 'Toca para ocultar' : (hint ?? 'Toca para ver cómo se usa')}</span>
        </span>
        <span className="set-chev" aria-hidden="true">
          <Icon name="chevD" size={20} />
        </span>
      </button>
      {open && (
        <div className="help-body" id={id}>
          <p className="help-text">{text}</p>
          <strong className="help-sub">Paso a paso</strong>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s}>
                <span>
                  <Rich text={s} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
