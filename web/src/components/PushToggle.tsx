import { useEffect, useState } from 'react'
import { currentPushState, disablePush, enablePush, sendTest } from '../lib/push'
import type { PushState } from '../lib/push'

export default function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    void currentPushState().then(setState)
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Algo salió mal', error: true })
    }
    setBusy(false)
    setState(await currentPushState())
  }

  return (
    <section className="card" id="avisos">
      <strong>Avisos</strong>
      <span className="muted">Recibe una notificación cuando tu pareja registre un gasto o un aporte.</span>

      {state === null && <span className="muted">Comprobando…</span>}
      {state === 'unsupported' && (
        <span className="muted">
          Este navegador no admite avisos. En iPhone instala la app (Compartir → Añadir a pantalla de inicio) y
          ábrela desde el ícono.
        </span>
      )}
      {state === 'denied' && (
        <span className="muted">
          Bloqueaste las notificaciones. Actívalas en los ajustes del teléfono para esta app y vuelve aquí.
        </span>
      )}
      {state === 'off' && (
        <button className="btn small" type="button" disabled={busy} onClick={() => void run(enablePush)}>
          Activar avisos
        </button>
      )}
      {state === 'on' && (
        <div className="row">
          <button
            className="btn ghost small"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const n = await sendTest()
                setMsg(
                  n > 0
                    ? { text: 'Aviso de prueba enviado.', error: false }
                    : { text: 'No se envió ningún aviso. Revisa los registros de la función.', error: true },
                )
              })
            }
          >
            Enviar prueba
          </button>
          <button className="btn ghost small" type="button" disabled={busy} onClick={() => void run(disablePush)}>
            Desactivar
          </button>
        </div>
      )}

      {msg && (
        <p className={msg.error ? 'error' : 'notice'} role="alert">
          {msg.text}
        </p>
      )}
    </section>
  )
}