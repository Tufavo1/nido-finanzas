import { useEffect, useState } from 'react'
import { promptInstall, useInstallState } from '../lib/install'
import { NEEDS } from '../lib/needs'
import type { Need } from '../lib/needs'
import { currentPushState } from '../lib/push'
import type { PushState } from '../lib/push'

type Tone = 'ok' | 'warn' | 'off'
interface Status {
  tone: Tone
  label: string
  detail?: string
  action?: { label: string; run: () => void }
}

function storageWorks(): boolean {
  try {
    const k = 'contigo-check'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

const MARK: Record<Tone, string> = { ok: '✓', warn: '!', off: '–' }

/** Qué necesita la app y en qué estado está en este dispositivo */
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

  function status(id: Need['id']): Status {
    switch (id) {
      case 'storage':
        return storageWorks()
          ? { tone: 'ok', label: 'Funciona' }
          : { tone: 'warn', label: 'Bloqueado', detail: 'Tu navegador no deja guardar datos (¿ventana privada o bloqueo de cookies?). Tendrás que entrar cada vez.' }
      case 'bots':
        return { tone: 'ok', label: 'Se usa al entrar', detail: 'Si no te deja entrar, permite challenges.cloudflare.com o pausa tu bloqueador en este sitio.' }
      case 'internet':
        return online ? { tone: 'ok', label: 'Conectado' } : { tone: 'warn', label: 'Sin conexión', detail: 'Vuelve a conectarte para ver y guardar tus datos.' }
      case 'install':
        if (install === 'installed') return { tone: 'ok', label: 'Instalada' }
        if (install === 'available') {
          return {
            tone: 'off',
            label: 'Sin instalar',
            action: {
              label: 'Instalar app',
              run: () => void promptInstall().then((ok) => setMsg(ok ? '¡Contigo quedó instalada!' : 'No se instaló. Puedes intentarlo cuando quieras.')),
            },
          }
        }
        if (install === 'ios') {
          return { tone: 'off', label: 'Sin instalar', detail: 'En iPhone o iPad: toca Compartir en Safari y elige «Añadir a pantalla de inicio».' }
        }
        return { tone: 'off', label: 'No disponible aquí', detail: 'Este navegador no permite instalarla. Prueba con Chrome, Edge o Safari, o ábrela desde el menú del navegador («Instalar» o «Añadir a pantalla de inicio»).' }
      case 'push':
        if (push === null) return { tone: 'off', label: 'Comprobando…' }
        if (push === 'on') return { tone: 'ok', label: 'Activadas' }
        if (push === 'denied') return { tone: 'warn', label: 'Bloqueadas', detail: 'Las bloqueaste. Permítelas en los ajustes del teléfono o del navegador para este sitio.' }
        if (push === 'unsupported') return { tone: 'off', label: 'No disponibles', detail: 'Este navegador no las admite. En iPhone primero instala la app.' }
        return {
          tone: 'off',
          label: 'Desactivadas',
          action: { label: 'Configurar', run: () => document.getElementById('avisos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
        }
    }
  }

  return (
    <section className="card" aria-label="Permisos y datos">
      <strong>Permisos y datos</strong>
      <span className="muted">Esto es lo que necesita Contigo en este dispositivo. Lo opcional lo decides tú y puedes cambiarlo cuando quieras.</span>
      <div className="stack tight">
        {NEEDS.map((n) => {
          const s = status(n.id)
          return (
            <div className="need" key={n.id}>
              <span className={`need-mark ${s.tone}`} aria-hidden="true">
                {MARK[s.tone]}
              </span>
              <div className="grow">
                <div className="row between">
                  <span className="strong">{n.title}</span>
                  <span className="pill">{n.required ? 'Necesario' : 'Opcional'}</span>
                </div>
                <div className="small-text">
                  <span className={s.tone === 'warn' ? 'over' : 'muted'}>{s.label}</span>
                </div>
                <div className="muted small-text">{s.detail ?? n.why}</div>
                {s.action && (
                  <button type="button" className="btn ghost small need-action" onClick={s.action.run}>
                    {s.action.label}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}
    </section>
  )
}
