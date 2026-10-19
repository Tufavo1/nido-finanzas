import { useState } from 'react'
import { installPromptSnoozed, promptInstall, snoozeInstallPrompt, useInstallState } from '../lib/install'

/** Pregunta una vez si quiere instalar la app. Si dice que no, queda el botón en Ajustes. */
export default function InstallBanner({ onToast }: { onToast: (text: string) => void }) {
  const state = useInstallState()
  const [hidden, setHidden] = useState(installPromptSnoozed)
  if (hidden || (state !== 'available' && state !== 'ios')) return null

  function later() {
    snoozeInstallPrompt()
    setHidden(true)
    onToast('Listo. Puedes instalarla cuando quieras desde Ajustes.')
  }

  async function install() {
    const ok = await promptInstall()
    if (ok) onToast('¡Contigo quedó instalada!')
    else later()
  }

  return (
    <div className="install-banner" role="region" aria-label="Instalar la aplicación">
      <div className="grow">
        <strong>¿Quieres instalar Contigo?</strong>
        <span className="muted small-text install-text">
          {state === 'ios'
            ? 'Toca el botón Compartir del navegador y luego «Añadir a pantalla de inicio».'
            : 'Se abre más rápido, a pantalla completa y con su propio ícono.'}
        </span>
      </div>
      <div className="row">
        {state === 'available' && (
          <button type="button" className="btn small" onClick={() => void install()}>
            Instalar
          </button>
        )}
        <button type="button" className="btn ghost small" onClick={later}>
          {state === 'ios' ? 'Entendido' : 'Ahora no'}
        </button>
      </div>
    </div>
  )
}
