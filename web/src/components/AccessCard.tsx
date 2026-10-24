import { useEffect, useState } from 'react'
import { promptInstall, useInstallState } from '../lib/install'
import { currentPushState } from '../lib/push'
import type { PushState } from '../lib/push'

type Tone = 'ok' | 'warn' | 'off'

const MARK: Record<Tone, string> = { ok: '✓', warn: '!', off: '–' }

/** Lo primordial de este celular, en tres filas: internet, si la app está instalada y si los avisos están activos. Solo para el administrador. */
export default function AccessCard() {
  const install = useInstallState()
  const [push, setPush] = useState<PushState | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void currentPushState().then(setPush)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const rows: { title: string; tone: Tone; label: string; action?: { label: string; run: () => void } }[] = [
    { title: 'Internet', tone: online ? 'ok' : 'warn', label: online ? 'Conectado' : 'Sin conexión' },
    install === 'installed'
      ? { title: 'App instalada', tone: 'ok', label: 'Sí' }
      : install === 'available'
        ? {
            title: 'App instalada',
            tone: 'off',
            label: 'No',
            action: {
              label: 'Instalar app',
              run: () => void promptInstall().then((ok) => setMsg(ok ? '¡Contigo quedó instalada!' : 'No se instaló.')),
            },
          }
        : { title: 'App instalada', tone: 'off', label: 'No' },
    {
      title: 'Avisos',
      tone: push === 'on' ? 'ok' : push === 'denied' ? 'warn' : 'off',
      label: push === null ? '…' : push === 'on' ? 'Activados' : push === 'denied' ? 'Bloqueados' : push === 'unsupported' ? 'No disponibles' : 'Desactivados',
    },
  ]

  return (
    <section className="card" aria-label="Instalación y conexión">
      <div className="stack tight">
        {rows.map((r) => (
          <div className="need" key={r.title}>
            <span className={`need-mark ${r.tone}`} aria-hidden="true">
              {MARK[r.tone]}
            </span>
            <div className="grow row between">
              <span className="strong">{r.title}</span>
              <span className={r.tone === 'warn' ? 'over' : 'muted'}>{r.label}</span>
            </div>
            {r.action && (
              <button type="button" className="btn ghost small" onClick={r.action.run}>
                {r.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}
    </section>
  )
}
