import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Ventana encima de la pantalla (patrón Modal).
 * - Se cierra con Esc o tocando fuera.
 * - El foco entra a la ventana, no se escapa con Tab y vuelve a donde estaba al cerrar.
 * - La pantalla de fondo no se desplaza mientras está abierta.
 * Va en `document.body` para que ninguna animación la recorte.
 */
export default function Modal({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const el = box.current
    el?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (before && document.contains(before)) before.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className="sheet-back" role="presentation" onClick={onClose}>
      <div ref={box} className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  )
}
