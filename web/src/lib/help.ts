/** Todo el contenido de la pestaña Ayuda: cómo se usa cada sección y consejos de finanzas personales. */
export interface HelpTopic {
  id: string
  title: string
  /** Una línea para el índice */
  hint: string
  text: string
  /** Pasos o ideas concretas; admite **negrita** */
  steps: string[]
}

export interface HelpGroup {
  id: string
  title: string
  hint: string
  topics: HelpTopic[]
}

export const HELP_GROUPS: HelpGroup[] = [
  {
    id: 'uso',
    title: 'Cómo usar la app',
    hint: 'Para qué sirve cada sección y cómo se usa paso a paso',
    topics: [
      {
        id: 'registrar',
        title: 'Registrar un gasto',
        hint: 'Anotar lo que gastaste en segundos',
        text: 'Cada compra que anotas se suma a los totales del mes y a la categoría que elijas. Mientras más al día esté, más útil es el análisis.',
        steps: [
          'Toca el botón **Registrar**.',
          'Escribe el **monto** con el teclado y elige la categoría.',
          'Indica quién pagó y si es un gasto **compartido** o personal.',
          'Toca guardar. Si te equivocas, puedes corregirlo o borrarlo en la pestaña **Gastos**.',
        ],
      },
      {
        id: 'gastos',
        title: 'Gastos: movimientos y presupuesto por categoría',
        hint: 'Ver, filtrar y corregir lo gastado; ponerle tope a cada categoría',
        text: 'Cada categoría agrupa un tipo de gasto: supermercado, transporte, ocio. Si le pones un tope mensual, la barra te muestra cuánto llevan gastado y cuánto les queda.',
        steps: [
          'En **Presupuesto por categoría**, toca una categoría y luego el **lápiz**.',
          'Escribe cuánto quieren gastar **al mes** en ella y guarda.',
          'Mira la barra: mientras más llena, más cerca del tope. Si se pone roja, ya se pasaron.',
          'Toca **Ver en qué se fue** para saber qué compras pesaron más.',
          'En **Movimientos**, filtra por categoría o por día y toca un gasto para corregirlo o borrarlo.',
        ],
      },
      {
        id: 'fijos',
        title: 'Gastos fijos: lo que pagas igual cada mes',
        hint: 'Arriendo, luz, internet, suscripciones: se anotan solos',
        text: 'Son pagos que se repiten todos los meses con el mismo monto: arriendo, luz, internet, celular, suscripciones. Los anotas una sola vez y la app los agrega a tus gastos sola. Para compras que cambian, como el supermercado, usa el botón Registrar.',
        steps: [
          'En **Finanzas > Fijos**, toca **Agregar un gasto fijo**.',
          'Elige qué es, por ejemplo **Arriendo**, y escribe cuánto pagas al mes.',
          'Elige el **día del mes** en que se paga y su categoría.',
          'Listo: cada mes aparecerá solo en tus gastos. Toca una tarjeta para editarlo, pausarlo o borrarlo.',
        ],
      },
      {
        id: 'sueldo',
        title: 'Sueldo: cuánto te depositan al mes',
        hint: 'Con tu sueldo la app calcula cuánto te queda de verdad',
        text: 'Aquí guardas lo que te pagan por tu trabajo. Con ese número la app calcula cuánto te sobra después de pagar tus gastos y tus deudas, y solo tú lo ves. Los bonos o ventas ocasionales no van aquí: anótalos en Ingresos extra.',
        steps: [
          'En **Finanzas > Sueldo**, escribe tu sueldo **líquido**: lo que realmente llega a tu cuenta, después de los descuentos de AFP, salud e impuestos.',
          'Elige el **día del mes** en que te depositan.',
          'Toca **Guardar mi sueldo**.',
          'Verás **cuánto te queda** este mes y si vas bien. Si solo sabes el sueldo bruto, usa **Calcular mi sueldo líquido**.',
        ],
      },
      {
        id: 'deudas',
        title: 'Deudas: lo que debes y cuándo terminas de pagar',
        hint: 'Tarjetas, créditos y préstamos con su fecha de término',
        text: 'Una deuda es plata que todavía tienes que devolver: una tarjeta, un crédito del banco o un préstamo de un familiar. Al anotarla, la app te muestra cuánto falta y en cuántos meses terminas.',
        steps: [
          'En **Finanzas > Deudas**, toca **Agregar una deuda**.',
          'Ponle un nombre que reconozcas, por ejemplo Tarjeta Banco Estado, y escribe **cuánto falta pagar hoy**.',
          'Si lo sabes, agrega la **cuota mensual** y el **interés**. Con eso calculamos en cuántos meses terminas.',
          'Cada vez que pagues una cuota, abre la deuda y toca **Anotar un pago**. El saldo baja solo.',
        ],
      },
      {
        id: 'metas',
        title: 'Metas: ahorrar para algo concreto',
        hint: 'Un viaje, un fondo de imprevistos, un electrodoméstico',
        text: 'Una meta es algo que quieren pagar con ahorro: un viaje, el ahorro para imprevistos, un electrodoméstico. Cada aporte que anotan acerca la barra al objetivo.',
        steps: [
          'Toca **Nueva meta**.',
          'Escribe qué quieren lograr y **cuánto cuesta**.',
          'Si tienen una fecha límite, agrégala: la app calcula cuánto aportar **por mes**.',
          'Cada vez que ahorren, abre la meta y toca **Aportar a esta meta**.',
        ],
      },
      {
        id: 'perfil',
        title: 'Perfil: tu perfil financiero y tu cuenta',
        hint: 'Qué perfil eres, tu nivel y cómo subir',
        text: 'El Perfil financiero (en Ajustes) reúne quién eres con la plata (según tu análisis), los datos de tu cuenta y qué puede ver tu pareja de lo tuyo. Todo el perfil financiero es privado: solo tú lo ves.',
        steps: [
          'El **perfil** (por ejemplo Equilibrado/a o Reconstruyendo) sale de tu ahorro, tus deudas, tus gastos y tu colchón. Necesita tu **sueldo** y tus gastos del mes.',
          'El **nivel** va de 1 a 5 según tu puntaje de 100 puntos y te dice cuántos te faltan para el siguiente.',
          'Los **3 pasos** te dicen qué hacer primero, empezando por lo que más pesa.',
          'En **Mi cuenta** cambias tu nombre, tu correo (se confirma desde el correo nuevo) y tu contraseña.',
        ],
      },
      {
        id: 'privacidad',
        title: 'Privacidad con tu pareja',
        hint: 'Qué ve tu pareja de lo tuyo y qué es siempre privado',
        text: 'Tú decides qué parte de lo tuyo ve tu pareja. Por defecto se comparte todo, y puedes esconder cosas cuando quieras.',
        steps: [
          'En **Ajustes > Perfil financiero > Privacidad con mi pareja**, activa o desactiva: tus deudas, tus gastos fijos personales, tus gastos personales y tus aportes a metas.',
          'Lo **compartido** (gastos, fijos y deudas de los dos) se ve siempre: es de ambos.',
          'Tu **sueldo**, tus **ingresos extra**, tu análisis y tu perfil son **siempre privados**.',
          'Si escondes tus gastos personales, el total del hogar que ve tu pareja no los incluye, y no le llegan avisos de ellos.',
        ],
      },
      {
        id: 'puntaje',
        title: '¿Cómo se calcula el puntaje financiero?',
        hint: 'Los cuatro factores que suman hasta 100 puntos',
        text: 'El puntaje de Finanzas > Análisis es una orientación con tus datos; no reemplaza a un asesor financiero. Si falta algún dato, se calcula con lo que hay.',
        steps: [
          '**Ahorro** (40 puntos): se llega al máximo ahorrando el 20 % de lo que ganas.',
          '**Deudas** (25 puntos): máximo si tus cuotas están bajo el 15 % de tu ingreso.',
          '**Presupuesto** (15 puntos): categorías del hogar dentro del tope definido.',
          '**Ahorro para imprevistos** (20 puntos): lo que llevas en tu meta de imprevistos frente a 6 meses de gastos.',
        ],
      },
      {
        id: 'mes',
        title: '¿Cómo se calcula lo que te sobra en el mes?',
        hint: 'Qué entra en «Gastas», «Te sobra» y «Libre de verdad»',
        text: '«Gastas» es tu costo real: tus gastos personales más tu parte de los compartidos. «Te sobra» es lo que ganas menos lo que gastas y menos tus cuotas de deuda.',
        steps: [
          'Al cierre del mes se estima con tu **ritmo diario** actual.',
          '**Libre de verdad** descuenta además los gastos fijos que aún no vencen este mes.',
          'Si anotas un **ahorro**, se descuenta de lo que te queda, así ves cuánto puedes gastar.',
          'Ahorrar entre **10 % y 20 %** de lo que ganas es una meta sana.',
        ],
      },
    ],
  },
  {
    id: 'consejos',
    title: 'Consejos de finanzas personales',
    hint: 'Ideas simples para ordenar la plata y mejorar mes a mes',
    topics: [
      {
        id: 'regla-50-30-20',
        title: 'La regla 50/30/20',
        hint: 'Una guía para repartir lo que ganas',
        text: 'Es una referencia popular, no una ley: la mitad de lo que ganas para lo básico, 30 % para gustos y 20 % para ahorrar o pagar deudas más rápido. Ajústala a tu realidad.',
        steps: [
          '**50 % necesidades:** arriendo, cuentas, supermercado, transporte y cuotas mínimas.',
          '**30 % gustos:** salidas, ocio, suscripciones, compras que no son urgentes.',
          '**20 % ahorro:** fondo de imprevistos, metas y pagos extra a deudas.',
          'Si hoy tus necesidades pasan del 50 %, no te castigues: empieza bajando **un** gasto y sube el ahorro de a poco.',
        ],
      },
      {
        id: 'fondo-imprevistos',
        title: 'Ahorro para imprevistos',
        hint: 'Cuánto tener guardado y cómo partir',
        text: 'Es plata guardada para lo inesperado: una reparación, una licencia médica, quedarte sin trabajo. Evita endeudarte cuando algo sale mal.',
        steps: [
          'Meta ideal: de **3 a 6 meses** de gastos básicos. Si hoy es mucho, parte con **un mes**.',
          'Crea una meta llamada **Imprevistos** en la pestaña Metas y aporta aunque sea poco cada mes.',
          'Apártalo **el día que te pagan**, antes de gastar, no con lo que sobre.',
          'No lo uses para gustos: solo para emergencias reales. Si lo usas, repónlo.',
        ],
      },
      {
        id: 'orden-deudas',
        title: 'En qué orden pagar las deudas',
        hint: 'Avalancha o bola de nieve',
        text: 'Cuando tienes varias deudas, pagar las cuotas mínimas en todas y dirigir lo extra a una sola acelera mucho el término.',
        steps: [
          '**Avalancha:** el extra va a la deuda que **más interés cobra**. Es la que ahorra más plata.',
          '**Bola de nieve:** el extra va a la deuda **más chica**. Cierras deudas rápido y eso motiva.',
          'Cuando termines una, su cuota completa pasa a la siguiente.',
          'Nunca dejes de pagar el mínimo en las demás: los atrasos traen multas e intereses penales.',
        ],
      },
      {
        id: 'tarjeta',
        title: 'Usar bien la tarjeta de crédito',
        hint: 'Cómo evitar que los intereses te coman el sueldo',
        text: 'La tarjeta es cómoda, pero su interés suele ser de los más altos. Usada con cuidado, es solo una forma de pagar; mal usada, es una deuda cara.',
        steps: [
          'Paga **el total** cada mes siempre que puedas: así no pagas intereses.',
          'Si no puedes, paga **más que el mínimo**: pagar solo el mínimo alarga la deuda por años.',
          'Evita pagar una tarjeta con otra o con avances en efectivo.',
          'Antes de comprar en cuotas, mira el **interés mensual** y cuánto pagarás en total.',
        ],
      },
      {
        id: 'gastos-hormiga',
        title: 'Gastos hormiga',
        hint: 'Los gastos chicos que suman mucho',
        text: 'Cafés, delivery, apps, compras de última hora: cada uno parece nada, pero juntos pueden ser una parte importante del mes.',
        steps: [
          'Anota **todo** durante un mes, aunque sea chico. Ver el total sorprende.',
          'Mira en **Gastos** qué categorías suben más de lo normal.',
          'Elige uno o dos que **no te hagan falta** y ponle un tope en el presupuesto por categoría.',
          'Reemplaza en vez de eliminar: lo que no se puede dejar de golpe, se reduce.',
        ],
      },
      {
        id: 'mes-en-rojo',
        title: 'Qué hacer si el mes queda en rojo',
        hint: 'Cuando los gastos y las cuotas superan lo que ganas',
        text: 'Si lo que gastas más tus cuotas es mayor que tu ingreso, el desbalance se va acumulando en deudas. Hay que actuar en los dos lados: gastar menos y ganar más.',
        steps: [
          'Revisa los **gastos fijos**: ¿hay suscripciones o planes que puedas pausar o cambiar por uno más barato?',
          'Busca renegociar o **consolidar** deudas con tasas altas; compara en Tasas de los bancos.',
          'Reduce primero las categorías **no esenciales** (gustos) y fija un tope diario.',
          'Piensa en **ingresos extra** temporales y anótalos en Ingresos extra para ver cómo cambian tu mes.',
        ],
      },
      {
        id: 'sueldo-bruto-liquido',
        title: 'Sueldo bruto y sueldo líquido',
        hint: 'Con cuál hacer las cuentas',
        text: 'El sueldo bruto es lo que dice el contrato. El líquido es lo que realmente llega a tu cuenta después de descontar AFP, salud e impuesto. Los planes de gasto siempre se hacen con el líquido.',
        steps: [
          'Usa **siempre el líquido** para decidir cuánto gastar y ahorrar.',
          'Si solo conoces el bruto, usa **Calcular mi sueldo líquido** en Finanzas > Sueldo.',
          'Los bonos y trabajos aparte no son fijos: anótalos como **ingresos extra**.',
        ],
      },
      {
        id: 'ahorrar-en-pareja',
        title: 'Ordenar la plata en pareja',
        hint: 'Gastos compartidos, reparto y transparencia',
        text: 'Hablar de plata a tiempo evita roces. Lo importante es que los dos entiendan qué es de cada uno y qué es de los dos.',
        steps: [
          'Definan qué es **compartido** (casa, comida, cuentas) y qué es **personal**.',
          'Elijan un reparto justo: **mitad y mitad** o proporcional al sueldo de cada uno.',
          'Revisen juntos **Entre ustedes** una vez al mes para saldar lo que se deben.',
          'Pongan una meta en común: ahorrar juntos para algo hace que sea más fácil mantener el hábito.',
        ],
      },
      {
        id: 'habito-mensual',
        title: 'Rutina de 10 minutos al mes',
        hint: 'Un hábito simple que hace la diferencia',
        text: 'No hace falta controlar la plata todos los días: una revisión corta y regular es suficiente.',
        steps: [
          'Anota los gastos que se hayan quedado sin registrar.',
          'Mira el **Análisis** de Finanzas y lee qué dice la app sobre tu mes.',
          'Revisa que tus **deudas** tengan el pago del mes anotado.',
          'Aporta a tus **metas** y ajusta algún tope que haya quedado corto o largo.',
        ],
      },
    ],
  },
]
