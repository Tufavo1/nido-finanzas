import { useState } from 'react'
import { getThemePref, setThemePref } from '../lib/theme'
import type { ThemePref } from '../lib/theme'

const OPTIONS: { key: ThemePref; label: string }[] = [
  { key: 'system', label: 'Auto' },
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Oscuro' },
]

export default function ThemeToggle() {
  const [pref, setPref] = useState(getThemePref)
  return (
    <section className="card">
      <strong>Apariencia</strong>
      <span className="muted">Auto sigue el modo claro u oscuro de tu teléfono.</span>
      <div className="seg" role="group" aria-label="Tema">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={pref === o.key}
            onClick={() => {
              setThemePref(o.key)
              setPref(o.key)
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )
}
