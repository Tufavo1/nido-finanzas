import { useEffect, useRef, useState } from 'react'
import { NEWS_SLIDES, WELCOME_SLIDES } from './tourSlides'
import { Rich } from '../lib/rich'

interface Props {
  kind: 'welcome' | 'news'
  onClose: () => void
}

/** Guía en pocas pantallas (bienvenida o novedades), con una animación cada una. Se cierra con Saltar o con Escape. */
export default function Tour({ kind, onClose }: Props) {
  const SLIDES = kind === 'news' ? NEWS_SLIDES : WELCOME_SLIDES
  const [i, setI] = useState(0)
  const next = useRef<HTMLButtonElement>(null)
  const last = i === SLIDES.length - 1
  const slide = SLIDES[i]!

  useEffect(() => {
    next.current?.focus()
  }, [i])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="tour-back">
      <div className="tour card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        {kind === 'news' && <span className="pill tour-label">Novedades</span>}
        <div className="tour-stage" key={i}>
          {slide.art}
        </div>
        <div className="stack tight" key={`t${i}`}>
          <h2 id="tour-title" className="tour-title">
            {slide.title}
          </h2>
          <p className="tour-text" aria-live="polite">
            <Rich text={slide.text} />
          </p>
        </div>
        <div className="tour-dots" aria-label={`Paso ${i + 1} de ${SLIDES.length}`} role="img">
          {SLIDES.map((s, n) => (
            <span key={s.title} className={n === i ? 'on' : ''} />
          ))}
        </div>
        <div className="row">
          {!last && (
            <button type="button" className="btn ghost" onClick={onClose}>
              Saltar
            </button>
          )}
          {i > 0 && (
            <button type="button" className="btn ghost" onClick={() => setI(i - 1)}>
              Atrás
            </button>
          )}
          <button ref={next} type="button" className="btn grow" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Empezar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
