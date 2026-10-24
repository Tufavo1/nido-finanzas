import { useEffect } from 'react'
import { Rich } from '../lib/rich'

export type ToastKind = 'success' | 'info' | 'warn' | 'error'
export type Notify = (text: string, kind?: ToastKind) => void
export interface ToastData {
  /** Primera línea = título; una segunda línea (tras un salto \n) es el detalle. Admite **negrita**. */
  text: string
  kind: ToastKind
  /** Cambia en cada aviso, para reiniciar el temporizador aunque el texto se repita */
  id: number
}

const MARK: Record<ToastKind, string> = { success: '✓', info: 'i', warn: '!', error: '✕' }
const MS: Record<ToastKind, number> = { success: 3200, info: 4000, warn: 5200, error: 6500 }

export default function Toast({ toast, onDone }: { toast: ToastData; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, MS[toast.kind])
    return () => clearTimeout(t)
  }, [toast, onDone])

  const [title, ...rest] = toast.text.split('\n')
  const detail = rest.join(' ').trim()
  return (
    <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} key={toast.id}>
      <span className="toast-mark" aria-hidden="true">
        {MARK[toast.kind]}
      </span>
      <div className="toast-text">
        <span className="toast-title">
          <Rich text={title} />
        </span>
        {detail && (
          <span className="toast-detail">
            <Rich text={detail} />
          </span>
        )}
      </div>
      <button type="button" className="toast-close" aria-label="Cerrar aviso" onClick={onDone}>
        ×
      </button>
      <span className="toast-timer" style={{ animationDuration: `${MS[toast.kind]}ms` }} aria-hidden="true" />
    </div>
  )
}
