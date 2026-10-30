import Icon from './Icon'
import { badge } from './tourSlides'
import type { Slide } from './tourSlides'

export type GuideScreen = 'home' | 'expenses' | 'money' | 'add' | 'goals'

const bars = (
  <div className="tour-art tour-bars" aria-hidden="true">
    <span style={{ ['--w' as string]: '86%' }} />
    <span style={{ ['--w' as string]: '58%' }} />
    <span style={{ ['--w' as string]: '34%' }} />
  </div>
)

const plus = (
  <div className="tour-art tour-add">
    <span className="tour-amount">$12.500</span>
    <span className="tour-plus">
      <Icon name="plus" size={30} />
    </span>
  </div>
)

const coins = (
  <div className="tour-art tour-coins" aria-hidden="true">
    <Icon name="wallet" size={56} />
    <i />
    <i />
    <i />
  </div>
)

const ring = (
  <svg className="tour-art tour-ring" viewBox="0 0 80 80" width="96" height="96" aria-hidden="true">
    <circle cx="40" cy="40" r="32" />
    <circle cx="40" cy="40" r="32" />
  </svg>
)

const scope: Slide = {
  title: 'Hogar, Yo o tu pareja',
  text: 'Arriba eliges **a quién miras**: todo el **Hogar**, solo lo tuyo (**Yo**) o lo de tu **pareja**. Lo que tu pareja decidió no compartir no aparece.',
  art: badge('user'),
}

/** Guía de cada pantalla: se abre con el botón de ayuda de su encabezado */
export const SCREEN_GUIDES: Record<GuideScreen, { label: string; slides: Slide[] }> = {
  home: {
    label: 'Ayuda de Inicio',
    slides: [
      {
        title: 'Esta es tu pantalla de inicio',
        text: 'Aquí ves **de un vistazo cómo va el mes**: cuánto se ha gastado, en qué, y si hay algo que atender. Es la pantalla para entrar y mirar, no hace falta tocar nada.',
        art: badge('home'),
      },
      {
        title: 'Avisos para ti',
        text: 'Arriba aparecen los **avisos**: una cuenta por vencer, un gasto que subió o una meta atrasada. Cada aviso tiene un **botón para ir a resolverlo**, y puedes **posponerlo** si no es el momento.',
        art: badge('bell'),
      },
      {
        title: 'Cambia de mes',
        text: 'Con las **flechas** junto al nombre del mes ves los meses anteriores. Los gráficos muestran **en qué se fue la plata** y cómo se compara con el mes pasado.',
        art: bars,
      },
      scope,
      {
        title: 'Ajustes y seguridad',
        text: 'El **engranaje** de arriba a la derecha abre los ajustes: la clave de la app, las notificaciones y esta guía de bienvenida si quieres verla otra vez.',
        art: badge('gear'),
      },
    ],
  },
  expenses: {
    label: 'Ayuda de Gastos',
    slides: [
      {
        title: 'Aquí revisan lo gastado',
        text: 'En **Gastos** ven cada compra del mes, cuánto llevan por categoría y si se están pasando. Para anotar un gasto nuevo usen el botón **Registrar**.',
        art: badge('list'),
      },
      {
        title: 'Resumen del mes',
        text: 'Muestra **cuánto se gasta y a qué ritmo**. Si el ritmo es muy alto para el mes, la app se lo avisa a tiempo.',
        art: bars,
      },
      {
        title: 'Tope por categoría',
        text: 'Toca una categoría y luego el **lápiz** para escribir cuánto quieren gastar **al mes** en ella. La barra se va llenando; si se pone **roja**, ya se pasaron.',
        art: bars,
      },
      {
        title: 'Corregir o borrar un gasto',
        text: 'En **Movimientos** pueden filtrar por **categoría o por día**. Toca un gasto para **corregirlo o borrarlo** si se equivocaron.',
        art: badge('edit'),
      },
      scope,
    ],
  },
  money: {
    label: 'Ayuda de Finanzas',
    slides: [
      {
        title: 'Tu plata en cuatro partes',
        text: 'En **Finanzas** hay cuatro pestañas: **Análisis**, **Sueldo**, **Fijos** y **Deudas**. Cambias de una a otra con los botones de arriba.',
        art: coins,
      },
      {
        title: 'Análisis: cómo te queda el mes',
        text: 'Compara tu **sueldo** con lo que gastas, tus deudas y tu ahorro, y te dice **cuánto te queda de verdad** y si vas bien.',
        art: ring,
      },
      {
        title: 'Sueldo',
        text: 'Escribe lo que te **depositan al mes** (el líquido) y el **día** en que llega. Si solo sabes el bruto, usa **Calcular mi sueldo líquido**. Solo tú lo ves.',
        art: badge('wallet'),
      },
      {
        title: 'Gastos fijos',
        text: 'Arriendo, luz, internet, suscripciones: se anotan **una sola vez** y la app los agrega **solos cada mes**. Toca una tarjeta para editarla, pausarla o borrarla.',
        art: badge('list'),
      },
      {
        title: 'Deudas',
        text: 'Anota tarjetas, créditos o préstamos y verás **cuánto falta y cuándo terminas de pagar**. Toca una deuda para **anotar un pago**. También hay **tasas de bancos** para comparar.',
        art: badge('target'),
      },
      scope,
    ],
  },
  add: {
    label: 'Ayuda de Registrar',
    slides: [
      {
        title: 'Anotar un gasto, paso a paso',
        text: 'Son **4 pasos cortos**. La barrita de arriba muestra en cuál van, y el botón **Volver** los lleva al paso anterior.',
        art: plus,
      },
      {
        title: '1. Personal o compartido',
        text: '**Compartido** si lo pagan entre los dos; **Personal** si es solo suyo. Así cada gasto queda en el lugar correcto.',
        art: badge('user'),
      },
      {
        title: '2. Descuento',
        text: 'Si el precio venía **rebajado**, toque el porcentaje (10, 20, 30 o 50) o escriba otro. La app **calcula lo que realmente pagó**.',
        art: badge('target'),
      },
      {
        title: '3. En qué se gastó',
        text: 'Toque el botón de la **categoría**, por ejemplo Supermercado o Transporte. Al tocarlo pasa solo al siguiente paso.',
        art: badge('list'),
      },
      {
        title: '4. Monto y guardar',
        text: 'Toque los **números** para escribir el monto y luego **Guardar**. En **Más** puede cambiar quién pagó, la fecha o agregar una nota.',
        art: plus,
      },
    ],
  },
  goals: {
    label: 'Ayuda de Metas',
    slides: [
      {
        title: 'Ahorrar juntos para algo',
        text: 'Una **meta** es algo que quieren lograr: un viaje, un fondo para imprevistos o un regalo. Van sumando **aportes** hasta llegar.',
        art: ring,
      },
      {
        title: 'Crear una meta',
        text: 'Toque **Nueva meta**, póngale un nombre, cuánto quieren juntar y para cuándo. La app calcula **cuánto aportar al mes**.',
        art: plus,
      },
      {
        title: 'Anotar un aporte',
        text: 'Abra la meta y anote lo que **ahorraron**. El círculo se va llenando y verá **cuánto falta** y si van a tiempo.',
        art: ring,
      },
      {
        title: 'Resumen',
        text: 'Arriba ve **cuánto llevan ahorrado en total**, cuántas metas están **cumplidas** y cuáles **necesitan atención**.',
        art: badge('target'),
      },
      scope,
    ],
  },
}
