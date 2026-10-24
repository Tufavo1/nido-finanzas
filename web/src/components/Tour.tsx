import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'
import Logo from './Logo'
import { Rich } from '../lib/rich'

interface Slide {
  title: string
  text: string
  art: ReactNode
}

const SLIDES: Slide[] = [
  {
    title: 'Bienvenida a Contigo',
    text: 'Aquí llevan **las platas del hogar entre dos**: qué gastan, cuánto ahorran y qué deben, todo en un solo lugar y sin planillas.',
    art: <Logo size={84} animate />,
  },
  {
    title: 'Registra un gasto en segundos',
    text: 'Toca el botón **+** del centro, escribe el monto, elige la categoría y guarda. Cada gasto queda con la persona que lo pagó.',
    art: (
      <div className="tour-art tour-add">
        <span className="tour-amount">$12.500</span>
        <span className="tour-plus">
          <Icon name="plus" size={30} />
        </span>
      </div>
    ),
  },
  {
    title: 'Mira en qué se va la plata',
    text: 'En **Inicio** ves lo gastado del mes, un calendario con cada día y los últimos movimientos. En **Gastos** pones un tope por categoría.',
    art: (
      <div className="tour-art tour-bars" aria-hidden="true">
        <span style={{ ['--w' as string]: '86%' }} />
        <span style={{ ['--w' as string]: '58%' }} />
        <span style={{ ['--w' as string]: '34%' }} />
      </div>
    ),
  },
  {
    title: 'Sueldo, deudas y ahorro',
    text: 'En **Finanzas** anotas tu sueldo y tus deudas, y puedes probar cuánto tardas en pagarlas. Ahí también está la calculadora de sueldo líquido.',
    art: (
      <div className="tour-art tour-coins" aria-hidden="true">
        <Icon name="wallet" size={56} />
        <i />
        <i />
        <i />
      </div>
    ),
  },
  {
    title: 'Metas para ahorrar juntos',
    text: 'En **Metas** crean un objetivo, como un viaje o un ahorro para imprevistos, y van sumando aportes hasta llegar.',
    art: (
      <svg className="tour-art tour-ring" viewBox="0 0 80 80" width="96" height="96" aria-hidden="true">
        <circle cx="40" cy="40" r="32" />
        <circle cx="40" cy="40" r="32" />
      </svg>
    ),
  },
  {
    title: 'Invita a tu pareja',
    text: 'En **Ajustes** (el engranaje de Inicio) generas un código para sumar a tu pareja. Cada una ve lo mismo, al instante. Esta guía la puedes ver otra vez ahí mismo.',
    art: <Logo size={84} animate />,
  },
]

interface Props {
  onClose: () => void
}

/** Guía de bienvenida: pocas pantallas, con una animación cada una. Se cierra con Saltar o con Escape. */
export default function Tour({ onClose }: Props) {
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
