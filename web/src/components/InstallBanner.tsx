import { useState } from 'react'
import { installPromptSnoozed, isMobileDevice, promptInstall, snoozeInstallPrompt, useInstallState } from '../lib/install'
import InstallGuide from './InstallGuide'
import type { Notify } from './Toast'

/**
 * Aviso flotante para instalar Contigo. Donde el navegador lo permite, «Instalar ahora» abre el diálogo
 * del sistema al instante; en iPhone (y navegadores sin instalación directa) muestra los pasos en una hoja.
 * Si dice que no, vuelve a preguntar en unos días; siempre queda la guía en Ajustes.
 */
export default function InstallBanner({ onToast, onAuth = false }: { onToast?: Notify; onAuth?: boolean }) {
  const state = useInstallState()
  const [hidden, setHidden] = useState(installPromptSnoozed)
  const [guide, setGuide] = useState(false)
  if (state === 'installed' || (state !== 'available' && !isMobileDevice())) return null
  if (hidden && !guide) return null

  function later() {
    snoozeInstallPrompt()
    setGuide(false)
    setHidden(true)
    onToast?.('Sin problema\nPuedes instalarla cuando quieras desde **Ajustes**.', 'info')
  }

  async function install() {
    const ok = await promptInstall()
    if (ok) onToast?.('Contigo quedó instalada\nYa puedes abrirla desde tu **pantalla de inicio**.')
    else later()
  }

  return (
    <>
      {!hidden && (
        <div className={`install-banner${onAuth ? ' on-auth' : ''}`} role="region" aria-label="Instalar la aplicación">
          <div className="grow">
            <strong>Instala Contigo en tu celular</strong>
            <span className="muted small-text install-text">Se abre más rápido, a pantalla completa y con su propio ícono.</span>
          </div>
          <div className="row">
            {state === 'available' ? (
              <button type="button" className="btn small" onClick={() => void install()}>
                Instalar ahora
              </button>
            ) : (
              <button type="button" className="btn small" onClick={() => setGuide(true)}>
                Instalar ahora
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={later}>
              Ahora no
            </button>
          </div>
        </div>
      )}
      {guide && (
        <div className="sheet-back" role="dialog" aria-modal="true" aria-label="Cómo instalar Contigo">
          <div className="sheet card">
            <strong>Instalar Contigo</strong>
            <InstallGuide onToast={onToast} />
            <button type="button" className="btn ghost small" onClick={() => setGuide(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
