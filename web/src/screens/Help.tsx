import { useState } from 'react'
import Intro from '../components/Intro'
import SectionHead from '../components/SectionHead'
import { HELP_GROUPS } from '../lib/help'
import { NEWS_EVENT, TOUR_EVENT } from '../lib/tour'

/** Ayuda y consejos: un índice arriba y cada tema como desplegable */
export default function Help({ onBack }: { onBack?: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setOpen((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function goTo(id: string) {
    setOpen((cur) => new Set(cur).add(id))
    // Espera a que el tema se abra antes de llevar la vista hasta él
    requestAnimationFrame(() => document.getElementById(`ayuda-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <main className="screen">
      {onBack && (
        <button type="button" className="btn ghost small" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          Volver a Ajustes
        </button>
      )}
      <h1 className="title">Ayuda y consejos</h1>

      <section className="card wide" aria-label="Guía de bienvenida y novedades">
        <strong>Recorridos cortos</strong>
        <span className="muted small-text">Para recordar qué hace cada parte de Contigo o ver lo último que cambió.</span>
        <div className="row">
          <button type="button" className="btn ghost small grow" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
            Guía de bienvenida
          </button>
          <button type="button" className="btn ghost small grow" onClick={() => window.dispatchEvent(new Event(NEWS_EVENT))}>
            Novedades
          </button>
        </div>
      </section>

      <nav className="card wide help-index" aria-label="Índice de ayuda">
        <strong>¿Qué quieres ver?</strong>
        <span className="muted small-text">Toca un tema: se abre y te lleva hasta él.</span>
        <div className="help-index-groups">
          {HELP_GROUPS.map((g) => (
            <div key={g.id} className="help-index-group">
              <span className="help-sub">{g.title}</span>
              <ul>
                {g.topics.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => goTo(t.id)}>
                      <strong>{t.title}</strong>
                      <span className="muted small-text">{t.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {HELP_GROUPS.map((g) => (
        <section key={g.id} className="help-group">
          <SectionHead title={g.title} hint={g.hint} />
          <div className="help-list">
            {g.topics.map((t) => (
              <Intro
                key={t.id}
                title={t.title}
                hint={t.hint}
                text={t.text}
                steps={t.steps}
                anchor={`ayuda-${t.id}`}
                open={open.has(t.id)}
                onToggle={() => toggle(t.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
