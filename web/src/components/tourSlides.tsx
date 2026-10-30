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
    title: 'Contigo se renovó',
    text: 'Hicimos la app **más ordenada y más fácil de usar**, en el celular y también en el computador. Te mostramos lo nuevo en un minuto.',
    art: <Logo size={84} animate />,
  },
  {
    title: 'Todo en tarjetas',
    text: 'Gastos fijos, deudas, metas, categorías e ingresos extra ahora son **tarjetas**. Toca una para ver el detalle, editarla o borrarla; agregar también abre una ventana propia.',
    art: badge('list'),
  },
  {
    title: 'Secciones que se abren y cierran',
    text: 'En Gastos, Finanzas y Metas cada tema tiene su **desplegable**, con el primero abierto. Así ves lo importante primero y el resto cuando lo necesitas.',
    art: badge('chevD'),
  },
  {
    title: 'Tu perfil financiero',
    text: 'El nuevo **Perfil financiero** (en Ajustes) te dice qué tipo de perfil financiero tienes, en qué nivel vas y los **tres pasos** para subir. También ahí cambias nombre, correo y contraseña.',
    art: badge('user'),
  },
  {
    title: 'Tú decides qué ve tu pareja',
    text: 'En **Ajustes → Perfil financiero → Privacidad** apagas por tema (deudas, fijos, gastos personales, ahorro) lo que no quieres compartir. Lo que ocultas no se ve, ni siquiera en las notificaciones.',
    art: badge('lock'),
  },
  {
    title: 'Más análisis, menos cuentas',
    text: 'Los gastos fijos ahora tienen **análisis**: cuánto pesan en tu sueldo y dónde se va más. Y en tu sueldo, **«Usar»** guarda el líquido calculado al tiro y te avisa.',
    art: badge('target'),
  },
  {
    title: 'Ayuda a un toque',
    text: 'La **Ayuda** (dentro de **Ajustes**, con el engranaje de Inicio) reúne todos los consejos en desplegables, con un **índice** para ir directo al tema. Esta guía la puedes ver otra vez ahí mismo.',
    art: badge('help'),
  },
]
