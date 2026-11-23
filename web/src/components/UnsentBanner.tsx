// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import Spin from './Spin'
import { unsentMessage } from '../lib/draftFlags'

/** Aviso visible en toda la app: hay gastos que confirmaste en la notificación y aún no llegaron a tu cuenta. */
export default function UnsentBanner({ count, onSend }: { count: number; onSend: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  if (count === 0) return null
  return (
    <div className="unsent-bar" role="status">
      <span>
        <strong>{unsentMessage(count)}.</strong> Los guardaste desde la notificación, pero todavía no están en tu cuenta.
      </span>
      <button
        type="button"
        className="btn small"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void onSend().finally(() => setBusy(false))
        }}
      >
        {busy ? <Spin label="Enviando…" /> : 'Enviar ahora'}
      </button>
    </div>
  )
}
