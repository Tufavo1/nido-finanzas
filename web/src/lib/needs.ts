/** Qué necesita Contigo para funcionar, en palabras de todos los días. Lo usan la pantalla de entrada y Ajustes. */
export interface Need {
  id: 'storage' | 'bots' | 'internet' | 'install' | 'push'
  title: string
  required: boolean
  why: string
}

export const NEEDS: Need[] = [
  {
    id: 'storage',
    title: 'Recordar tu sesión',
    required: true,
    why: 'Tu celular guarda un pequeño recordatorio para que no tengas que escribir tu clave cada vez que abres Contigo. No usamos publicidad ni te seguimos.',
  },
  {
    id: 'bots',
    title: 'Comprobar que eres una persona',
    required: true,
    why: 'Al entrar o crear tu cuenta hacemos un chequeo rápido para saber que no eres un robot. Si no te deja pasar, apaga tu bloqueador de anuncios solo para este sitio.',
  },
  {
    id: 'internet',
    title: 'Tener internet',
    required: true,
    why: 'Tus gastos se guardan en línea, así que necesitas internet para verlos y anotarlos. Sin internet, la app abre pero no puede mostrártelos.',
  },
  {
    id: 'install',
    title: 'Instalarla en tu celular',
    required: false,
    why: 'Opcional. Queda con su propio ícono como cualquier app, abre más rápido y a pantalla completa. En iPhone, instalarla es necesario para recibir avisos.',
  },
  {
    id: 'push',
    title: 'Recibir avisos',
    required: false,
    why: 'Opcional. Te avisamos cuando tu pareja anota un gasto o un aporte. Los puedes apagar cuando quieras.',
  },
]
