import { useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import Tour from './Tour'
import { SCREEN_GUIDES } from './screenGuides'
import type { GuideScreen } from './screenGuides'

/** Botón de ayuda del encabezado de cada pantalla: abre una guía corta de esa sección */
export default function ScreenHelp({ screen }: { screen: GuideScreen }) {
  const [open, setOpen] = useState(false)
  const guide = SCREEN_GUIDES[screen]
  return (
    <>
      <button
        type="button"
        className="help-btn"
        aria-label={`Ayuda de ${guide.label}: cómo funciona esta pantalla`}
        title="Ayuda"
        onClick={() => setOpen(true)}
      >
        <Icon name="help" />
      </button>
      {open &&
        // En el body, para quedar por encima de todo (las pantallas tienen animaciones que atrapan lo fijo)
        createPortal(<Tour kind="screen" slides={guide.slides} label={guide.label} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
