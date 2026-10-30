import { COPYRIGHT_HOLDER, CONTACT_EMAIL } from './about'

/** Versión de los textos: si cambian de fondo, se sube y se guarda con cada cuenta nueva */
export const LEGAL_VERSION = '2026-10-29'
export const LEGAL_DATE = '29 de octubre de 2026'

export interface LegalSection {
  title: string
  paragraphs?: string[]
  items?: string[]
}

export interface LegalDoc {
  id: 'privacy' | 'terms'
  title: string
  intro: string
  sections: LegalSection[]
}

export const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: 'Política de privacidad',
  intro: `Aquí te contamos, con palabras simples, qué datos guarda Contigo, para qué los usamos y qué puedes hacer con ellos. Última actualización: ${LEGAL_DATE}.`,
  sections: [
    {
      title: 'Quién es responsable',
      paragraphs: [`Contigo es una aplicación de ${COPYRIGHT_HOLDER}. Si tienes dudas sobre tus datos, escríbenos a ${CONTACT_EMAIL}.`],
    },
    {
      title: 'Qué datos guardamos',
      items: [
        'Tu correo electrónico y tu contraseña. La contraseña se guarda protegida, así que nosotros no podemos verla.',
        'Tu nombre dentro del hogar y el color que eliges.',
        'Lo que anotas en la app: gastos, categorías, metas, aportes, deudas, pagos, gastos fijos, sueldo, ingresos extra y tu perfil financiero.',
        'Si activas los avisos en el celular, un identificador de tu dispositivo para poder enviártelos.',
        'La fecha en que aceptaste estos textos.',
      ],
    },
    {
      title: 'Para qué usamos tus datos',
      paragraphs: [
        'Los usamos solo para que la app funcione: mostrarte tus gastos, calcular los análisis, enviarte los avisos que activaste y cuidar la seguridad de tu cuenta.',
        'No vendemos tus datos. No los usamos para publicidad.',
      ],
    },
    {
      title: 'Qué ve tu pareja',
      paragraphs: ['Si compartes un hogar con tu pareja, ella ve lo que es compartido. Lo demás depende de ti.'],
      items: [
        'Tu sueldo, tus ingresos extra y tu análisis personal nunca los ve tu pareja.',
        'Tus deudas, tus gastos fijos personales, tus gastos personales y tus aportes a metas los ve solo si tú lo permites. Lo cambias en Ajustes, en Perfil financiero y privacidad.',
      ],
    },
    {
      title: 'Dónde se guardan y quién nos ayuda',
      paragraphs: ['Para funcionar usamos dos servicios externos.'],
      items: [
        'Supabase guarda la base de datos y las cuentas, y envía los correos de confirmación.',
        'Cloudflare entrega el sitio, comprueba que quien se registra no es un robot y mide las visitas de forma general.',
        'Los datos viajan siempre por conexiones cifradas.',
      ],
    },
    {
      title: 'Cookies y datos en tu dispositivo',
      paragraphs: [
        'No usamos cookies de publicidad ni de seguimiento.',
        'Guardamos en tu dispositivo lo necesario para que la app funcione: tu sesión y tus preferencias, como el tema, el bloqueo y los avisos que pospusiste. Al cerrar sesión se borran de ese dispositivo los datos personales.',
      ],
    },
    {
      title: 'Cuánto tiempo los guardamos',
      paragraphs: [
        'Guardamos tus datos mientras tengas tu cuenta.',
        'Si borras tu cuenta, se eliminan tu correo, tus sesiones, tu sueldo, tus ingresos extra y tu perfil. Los gastos compartidos con tu pareja quedan en su historial, pero sin tu nombre. Si eras la única persona del hogar, se borra todo el hogar.',
      ],
    },
    {
      title: 'Tus derechos',
      items: [
        'Ver y corregir tus datos directamente en la app.',
        'Descargar un respaldo de tus datos desde Ajustes.',
        'Borrar tu cuenta cuando quieras desde Ajustes, en Salir del hogar o borrar la cuenta.',
        `Para cualquier otra solicitud sobre tus datos, escríbenos a ${CONTACT_EMAIL}.`,
      ],
    },
    {
      title: 'Cómo cuidamos tu información',
      paragraphs: [
        'Cada hogar solo puede ver sus propios datos. Las conexiones van cifradas, pedimos contraseñas largas y puedes activar un bloqueo de la app por inactividad.',
        'Aun así, ningún sistema es perfecto. Si algún día ocurre un problema que afecte tus datos, te lo informaremos.',
      ],
    },
    {
      title: 'Cambios en esta política',
      paragraphs: ['Si cambiamos algo importante, te avisaremos dentro de la app. La fecha de arriba siempre indica la última actualización.'],
    },
  ],
}

export const TERMS: LegalDoc = {
  id: 'terms',
  title: 'Términos y condiciones',
  intro: `Estas son las reglas simples para usar Contigo. Al crear tu cuenta, las aceptas. Última actualización: ${LEGAL_DATE}.`,
  sections: [
    {
      title: 'Qué es Contigo',
      paragraphs: [
        'Contigo es una herramienta para llevar las finanzas personales y de pareja: gastos, metas, deudas y sueldo.',
        'No es asesoría financiera, legal ni tributaria. Los cálculos y análisis, como el sueldo líquido, son una guía y pueden diferir de la realidad.',
      ],
    },
    {
      title: 'Tu cuenta',
      paragraphs: [
        'Contigo es para personas mayores de 18 años.',
        'Eres responsable de cuidar tu contraseña y de lo que ocurra en tu cuenta. Si crees que alguien más entró, cambia tu contraseña y cierra las otras sesiones desde Ajustes.',
      ],
    },
    {
      title: 'Tu hogar y tu pareja',
      paragraphs: [
        'Cada hogar tiene hasta dos personas. Lo que se registra como compartido lo ven las dos.',
        'El código de invitación es personal. Compártelo solo con la persona que quieres sumar.',
      ],
    },
    {
      title: 'Uso adecuado',
      items: [
        'No intentes entrar a datos o cuentas de otras personas.',
        'No uses la app para actividades ilegales.',
        'No intentes dañar el servicio ni sobrecargarlo.',
      ],
    },
    {
      title: 'Disponibilidad del servicio',
      paragraphs: [
        'Hacemos lo posible para que Contigo funcione siempre, pero puede haber interrupciones o cambios.',
        'Te recomendamos descargar un respaldo de tus datos de vez en cuando desde Ajustes.',
      ],
    },
    {
      title: 'Responsabilidad',
      paragraphs: [
        'Las decisiones que tomes con la información de la app son tuyas. Dentro de lo que la ley permita, no somos responsables por pérdidas que resulten de esas decisiones, de datos mal ingresados o de interrupciones del servicio.',
      ],
    },
    {
      title: 'Propiedad',
      paragraphs: [`La aplicación y su marca pertenecen a ${COPYRIGHT_HOLDER}. Los datos que tú ingresas siguen siendo tuyos.`],
    },
    {
      title: 'Terminar el uso',
      paragraphs: [
        'Puedes borrar tu cuenta cuando quieras desde Ajustes.',
        'Podemos suspender una cuenta que no cumpla estas reglas.',
      ],
    },
    {
      title: 'Cambios en estos términos',
      paragraphs: ['Si cambiamos algo importante, te avisaremos dentro de la app.'],
    },
    {
      title: 'Ley aplicable',
      paragraphs: ['Estos términos se rigen por las leyes de Chile.'],
    },
  ],
}

export const LEGAL_DOCS = { privacy: PRIVACY, terms: TERMS } as const
