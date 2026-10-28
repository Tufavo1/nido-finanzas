import { useEffect, useState } from 'react'
import { currentPushState, disablePush, enablePush, sendTest } from '../lib/push'
import type { PushState } from '../lib/push'
import { setSmartNotify, smartNotifyEnabled } from '../lib/smartNotify'
import Spin from './Spin'
import type { Notify } from './Toast'

const permission = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

function Row({ label, hint, on, disabled, busy, onToggle }: { label: string; hint: string; on: boolean; disabled: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <div className="stack tight">
      <div className="row between">
        <span className="grow">{label}</span>
        {busy ? <Spin label="Un momento…" /> : <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onToggle} />}
      </div>
      <span className="muted small-text">{hint}</span>
    </div>
  )
}

/** Dos interruptores: los avisos de tu pareja y los de la app. «Enviar prueba» solo lo ve el administrador. */
export default function PushToggle({ isAdmin = false, onToast }: { isAdmin?: boolean; onToast: Notify }) {
  const [state, setState] = useState<PushState | null>(null)
  const [smart, setSmart] = useState(smartNotifyEnabled)
  const [perm, setPerm] = useState(permission)
  const [busy, setBusy] = useState<'partner' | 'app' | 'test' | null>(null)

  useEffect(() => {
    void currentPushState().then(setState)
  }, [])

  async function run(which: 'partner' | 'app' | 'test', fn: () => Promise<void>) {
    setBusy(which)
    try {
      await fn()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Algo salió mal', 'error')
    }
    setBusy(null)
    setState(await currentPushState())
    setPerm(permission())
  }

  const partnerOn = state === 'on'
  const appOn = smart && perm === 'granted'
  const blocked = state === 'unsupported' || state === 'denied' || perm === 'unsupported' || perm === 'denied'

  return (
    <section className="card" id="avisos">
      <Row
        label="Avisos de tu pareja"
        hint="Cuando tu pareja anote un gasto o un aporte."
        on={partnerOn}
        disabled={state === null || state === 'unsupported' || state === 'denied' || busy !== null}
        busy={busy === 'partner'}
        onToggle={() => void run('partner', partnerOn ? disablePush : enablePush)}
      />
      <Row
        label="Avisos de la app"
        hint="Cuando algo de tus gastos, metas o deudas necesite atención. Salen al abrir la app."
        on={appOn}
        disabled={perm === 'unsupported' || perm === 'denied' || busy !== null}
        busy={busy === 'app'}
        onToggle={() =>
          void run('app', async () => {
            if (appOn) {
              setSmartNotify(false)
              setSmart(false)
              return
            }
            if (Notification.permission === 'default' && (await Notification.requestPermission()) !== 'granted') throw new Error('No se concedió el permiso de notificaciones')
            setSmartNotify(true)
            setSmart(true)
          })
        }
      />
      {blocked && (
        <span className="hint">
          {state === 'unsupported' || perm === 'unsupported'
            ? 'Este navegador no admite avisos. En iPhone instala la app (Compartir → Añadir a pantalla de inicio) y ábrela desde el ícono.'
            : 'Bloqueaste las notificaciones. Actívalas en los ajustes del teléfono para esta app y vuelve aquí.'}
        </span>
      )}
      {isAdmin && partnerOn && (
        <button
          className="btn ghost small"
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void run('test', async () => {
              const n = await sendTest()
              if (n > 0) onToast('Aviso de prueba enviado\nDebería llegarte en unos segundos.')
              else onToast('No se envió ningún aviso\nRevisa los registros de la función.', 'error')
            })
          }
        >
          {busy === 'test' ? <Spin label="Enviando…" /> : 'Enviar prueba'}
        </button>
      )}
    </section>
  )
}
