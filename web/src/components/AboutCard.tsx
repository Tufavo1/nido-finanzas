import { useState } from 'react'
import { BUILD_DATE, COMMIT, TAGLINE, VERSION, checkForUpdate, copyright } from '../lib/about'
import Logo from './Logo'

const fmtDate = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

/** Acerca de Contigo: versión, derechos y un gracias. */
export default function AboutCard() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function update() {
    setBusy(true)
    setMsg(null)
    try {
      const r = await checkForUpdate()
      setMsg(
        r === 'updating'
          ? 'Hay una versión nueva. La estoy instalando; la app se recargará sola.'
          : r === 'up-to-date'
            ? 'Ya tienes la última versión.'
            : 'Este navegador no permite buscar actualizaciones. Recarga la página para tener la última.',
      )
    } catch {
      setMsg('No se pudo comprobar. Revisa tu conexión e inténtalo de nuevo.')
    }
    setBusy(false)
  }

  return (
    <section className="card about" aria-label="Acerca de esta app">
      <div className="about-head">
        <Logo size={56} animate />
        <div>
          <strong className="about-name">Contigo</strong>
          <span className="muted small-text about-tag">{TAGLINE}</span>
        </div>
      </div>

      <dl className="about-facts">
        <div>
          <dt>Versión</dt>
          <dd className="num">{VERSION}</dd>
        </div>
        <div>
          <dt>Compilada</dt>
          <dd>{fmtDate.format(BUILD_DATE)}</dd>
        </div>
        {COMMIT && (
          <div>
            <dt>Build</dt>
            <dd className="num">{COMMIT}</dd>
          </div>
        )}
      </dl>

      <button type="button" className="btn ghost small" disabled={busy} onClick={() => void update()}>
        {busy ? 'Buscando…' : 'Buscar actualizaciones'}
      </button>
      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}

      <p className="about-thanks">
        <strong>Gracias por usar Contigo.</strong> Hecho con cariño para que cuidar la plata sea cosa de a dos… o de a uno.
        Tus datos son tuyos: puedes borrarlos cuando quieras, más arriba en esta misma pantalla.
      </p>
      <p className="muted small-text about-rights">{copyright()}</p>
    </section>
  )
}
