import type { ReactNode } from 'react'
import Icon from './Icon'
import Logo from './Logo'

export interface Slide {
  title: string
  text: string
  art: ReactNode
}

export const badge = (name: Parameters<typeof Icon>[0]['name']) => (
  <span className="tour-art tour-badge">
    <Icon name={name} size={40} />
  </span>
)

/** Guía de bienvenida: lo que hace la app, con la barra de abajo como hilo */
export const WELCOME_SLIDES: Slide[] = [
  {
    title: 'Bienvenida a Contigo',
    text: 'Aquí llevan **las platas del hogar entre dos**: qué gastan, cuánto ahorran y qué deben, todo en un solo lugar y sin planillas.',
    art: <Logo size={84} animate />,
  },
  {
    title: 'Registra un gasto en segundos',
    text: 'Toca **Registrar**, escribe el monto, elige la categoría y guarda. Cada gasto queda con la persona que lo pagó, y puedes marcar si hubo descuento.',
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
    text: 'En **Inicio** ves lo gastado del mes y sus gráficos. En **Gastos** pones un tope por categoría y revisas cada movimiento, con un filtro por día.',
    art: (
      <div className="tour-art tour-bars" aria-hidden="true">
        <span style={{ ['--w' as string]: '86%' }} />
        <span style={{ ['--w' as string]: '58%' }} />
        <span style={{ ['--w' as string]: '34%' }} />
      </div>
    ),
  },
  {
    title: 'Sueldo, fijos y deudas',
    text: 'En **Finanzas** anotas tu sueldo (hay una calculadora de líquido), tus gastos fijos y tus deudas. Cada una tiene su análisis y puedes ver todo por **Hogar, Yo o tu pareja**.',
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
    title: 'Ayuda y tu perfil',
    text: 'En **Ajustes** (el engranaje de Inicio) está la **Ayuda**, con consejos y un índice para ir directo a lo que buscas. En **Ajustes → Perfil financiero** ves qué perfil tienes, tu nivel y cómo subir, y manejas tu cuenta.',
    art: badge('help'),
  },
  {
    title: 'Invita a tu pareja',
    text: 'En **Ajustes → Perfil financiero → Mi hogar** generas un código para sumar a tu pareja. Cada una ve lo mismo, al instante, y tú decides qué temas no comparten. Esta guía la ves otra vez en Ajustes.',
    art: <Logo size={84} animate />,
  },
]

/** Guía de novedades: presenta lo que cambió; es solo para mirar, no hace falta probar nada */
export const NEWS_SLIDES: Slide[] = [
  {
    title: 'Pantallas más simples',
    text: 'Ahora **Inicio, Gastos, Sueldo, Fijos, Deudas y Metas** muestran lo importante en **tarjetas**. Toca una tarjeta para ver **todo el detalle** y editarla.',
    art: badge('wallet'),
  },
  {
    title: 'Registrar con nota',
    text: 'Al **registrar un gasto** cuenta **de qué es**: así después sabes en qué se fue la plata. La fecha es opcional y, si no la pones, se anota **hoy**. Puedes **cancelar** cuando quieras.',
    art: badge('plus'),
  },
  {
    title: 'Los gráficos, al final',
    text: 'En **Inicio** primero ves cuánto gastaron, tus cuentas y los últimos gastos. Los **gráficos** están más abajo, con un botón **Ver gráficos**.',
    art: badge('list'),
  },
]
