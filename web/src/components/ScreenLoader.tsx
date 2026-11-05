import { createPortal } from 'react-dom'
import LogoLoader from './LogoLoader'

/** Cargando a pantalla completa, delante de todo, con el fondo oscurecido y borroso */
export default function ScreenLoader({ text = 'Cargando…' }: { text?: string }) {
  return createPortal(
    <div className="loader-back" role="status" aria-live="polite" aria-busy="true">
      <div className="loader-card">
        <LogoLoader />
        <span className="muted">{text}</span>
      </div>
    </div>,
    document.body,
  )
}
