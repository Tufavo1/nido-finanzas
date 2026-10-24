import { useState } from 'react'
import { detectPlatform, promptInstall, useInstallState } from '../lib/install'
import type { Platform } from '../lib/install'

interface Guide {
  label: string
  intro: string
  steps: string[]
  note?: string
}

const GUIDES: Record<Platform, Guide> = {
  ios: {
    label: 'iPhone',
    intro: 'En iPhone y iPad se instala desde Safari. Toma menos de un minuto.',
    steps: [
      'Abre **contigo.dinovance.cl** en **Safari** (el ícono de la brújula azul).',
      'Toca el botón **Compartir**: el cuadrado con una flecha hacia arriba, abajo en el centro de la pantalla.',
      'Desliza el menú hacia arriba y toca **Añadir a pantalla de inicio**.',
      'Toca **Añadir**, arriba a la derecha. Contigo aparece como un ícono más entre tus apps.',
    ],
    note: 'Abre siempre Contigo desde ese ícono: así se ve a pantalla completa y es la única forma en que funcionan los avisos en iPhone.',
  },
  android: {
    label: 'Android',
    intro: 'En Android se instala desde Chrome, igual que cualquier app.',
    steps: [
      'Abre **contigo.dinovance.cl** en **Chrome**.',
      'Toca el botón **Instalar** de abajo o, si no aparece, el menú **⋮** (tres puntos, arriba a la derecha).',
      'Elige **Instalar aplicación** (o **Añadir a pantalla de inicio**) y confirma con **Instalar**.',
      'Contigo queda en tu pantalla de inicio y en el cajón de apps, con su propio ícono.',
    ],
    note: 'Con Samsung Internet: menú ≡ → Añadir página a → Pantalla de inicio.',
  },
}

const ORDER: Platform[] = ['ios', 'android']

/** «**texto**» en negrita, sin meter HTML */
function rich(text: string) {
  return text.split('**').map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))
}

/** Cómo instalar Contigo como app, paso a paso según el aparato. Lo usan la pantalla de entrada y Ajustes. */
export default function InstallGuide() {
  const state = useInstallState()
  const [platform, setPlatform] = useState<Platform>(detectPlatform)
  const [msg, setMsg] = useState<string | null>(null)
  const guide = GUIDES[platform]

  if (state === 'installed') {
    return (
      <div className="stack tight">
        <strong>Contigo ya está instalada en este aparato</strong>
        <span className="muted">Ábrela desde su ícono. Para instalarla en otro aparato, entra a contigo.dinovance.cl desde él.</span>
      </div>
    )
  }

  return (
    <div className="stack tight install-guide">
      <span className="muted">
        Contigo es una app web: no hay que bajarla de una tienda. Se instala desde el navegador, no ocupa casi espacio y se actualiza sola.
      </span>
      <div className="seg" role="group" aria-label="Tipo de aparato">
        {ORDER.map((p) => (
          <button key={p} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)}>
            {GUIDES[p].label}
          </button>
        ))}
      </div>
      <strong>{guide.intro}</strong>
      <ol className="install-steps">
        {guide.steps.map((s) => (
          <li key={s}>{rich(s)}</li>
        ))}
      </ol>
      {guide.note && <span className="hint">{guide.note}</span>}
      {state === 'available' && (
        <button
          type="button"
          className="btn small"
          onClick={() => void promptInstall().then((ok) => setMsg(ok ? '¡Contigo quedó instalada!' : 'No se instaló. Puedes intentarlo cuando quieras.'))}
        >
          Instalar ahora
        </button>
      )}
      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}
    </div>
  )
}
