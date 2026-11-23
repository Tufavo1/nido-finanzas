import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Rich } from '../lib/rich'
import type { Toast as ToastData } from '../lib/toastQueue'
import type { NotifyAction, UiToastKind } from '../lib/useToasts'

export type ToastKind = UiToastKind
/** Mostrar un aviso. El texto: primera línea = título; una segunda línea (tras \n) es el detalle. Admite **negrita**. */
export type Notify = (text: string, kind?: ToastKind, action?: NotifyAction) => void

const MARK: Record<ToastData['kind'], string> = { success: '✓', info: 'i', warning: '!', error: '✕' }

interface Props {
  toast: ToastData
  onDismiss: (id: string) => void
  onAction: (id: string) => void
}

/** El aviso visible. Va en document.body para quedar siempre arriba de ventanas y menús. Error = role alert; el resto = status. */
export default function Toast({ toast, onDismiss, onAction }: Props) {
  // Duración que le queda al montarse: alimenta la barra de tiempo (la tarjeta se vuelve a montar si el aviso se extiende)
  const [ms] = useState(() => Math.max(0, toast.expiresAt - Date.now()))
  const [title, ...rest] = toast.message.split('\n')
  const detail = rest.join(' ').trim()
  return createPortal(
    <div className={`toast ${toast.kind === 'warning' ? 'warn' : toast.kind}`} role={toast.role} key={toast.id}>
      <span className="toast-mark" aria-hidden="true">
        {MARK[toast.kind]}
      </span>
      <div className="toast-text">
        <span className="toast-title">
          <Rich text={title ?? ''} />
        </span>
        {detail && (
          <span className="toast-detail">
            <Rich text={detail} />
          </span>
        )}
      </div>
      {toast.action && (
        <button type="button" className="toast-action" onClick={() => onAction(toast.id)}>
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Cerrar aviso" onClick={() => onDismiss(toast.id)}>
        ×
      </button>
      <span className="toast-timer" style={{ animationDuration: `${ms}ms` }} aria-hidden="true" />
    </div>,
    document.body,
  )
}
