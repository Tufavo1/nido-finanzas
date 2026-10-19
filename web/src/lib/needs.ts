/** Qué necesita Contigo para funcionar, dicho claro. Lo usan la pantalla de entrada y Ajustes. */
export interface Need {
  id: 'storage' | 'bots' | 'internet' | 'install' | 'push'
  title: string
  required: boolean
  why: string
}

export const NEEDS: Need[] = [
  {
    id: 'storage',
    title: 'Almacenamiento del navegador',
    required: true,
    why: 'Guarda tu sesión y tus preferencias (tema, avisos ya vistos) para que no tengas que entrar cada vez. Contigo no usa cookies de publicidad ni de seguimiento.',
  },
  {
    id: 'bots',
    title: 'Verificación anti-bots',
    required: true,
    why: 'Al entrar o crear cuenta, Cloudflare Turnstile comprueba que no eres un robot. Si algún bloqueador de anuncios o de rastreo lo impide, desactívalo solo para este sitio.',
  },
  {
    id: 'internet',
    title: 'Conexión a internet',
    required: true,
    why: 'Tus datos viven en el servidor, así que para ver y guardar gastos hace falta conexión. Sin ella, la app abre pero no puede mostrarlos.',
  },
  {
    id: 'install',
    title: 'Instalar la app',
    required: false,
    why: 'Opcional. Se abre más rápido, a pantalla completa y con su propio ícono. Además, en iPhone es lo que permite recibir avisos.',
  },
  {
    id: 'push',
    title: 'Notificaciones',
    required: false,
    why: 'Opcional. Te avisan cuando tu pareja registra un gasto o un aporte. Puedes activarlas o desactivarlas cuando quieras.',
  },
]
