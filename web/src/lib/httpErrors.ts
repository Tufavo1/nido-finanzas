/**
 * Qué se le muestra a la persona cuando algo falla (403, 404, 429, 502, 503, 504…).
 * Una sola fuente para la app (components/ErrorPage.tsx) y para el proxy (worker/index.ts), que
 * arma con esto la página que ve quien abre una dirección con error en el navegador.
 * Frases cortas y sin jerga: qué pasó y qué hacer.
 */

export interface ErrorInfo {
  status: number
  /** Número grande de la página; vacío cuando no hay (sin conexión) */
  code: string
  title: string
  detail: string
  /** Vale la pena ofrecer «Reintentar» */
  retry: boolean
}

const SAFE = 'Tus datos están a salvo.'

const KNOWN: Record<number, Omit<ErrorInfo, 'status' | 'code'>> = {
  0: { title: 'Sin conexión', detail: 'Revisa tu internet e intenta de nuevo.', retry: true },
  400: { title: 'No pudimos entender eso', detail: 'Vuelve al inicio e intenta de nuevo.', retry: false },
  401: { title: 'Tu sesión venció', detail: 'Vuelve a entrar con tu correo y contraseña.', retry: false },
  403: { title: 'No tienes permiso para ver esto', detail: 'Si crees que es un error, cierra sesión y vuelve a entrar.', retry: false },
  404: { title: 'No encontramos esta página', detail: 'Puede que la dirección esté mal escrita o que ya no exista.', retry: false },
  405: { title: 'Esa acción no está permitida', detail: 'Vuelve al inicio e intenta de nuevo.', retry: false },
  408: { title: 'Está tardando demasiado', detail: `No hubo respuesta a tiempo. ${SAFE} Intenta de nuevo en un momento.`, retry: true },
  413: { title: 'Es demasiado grande', detail: 'Lo que intentaste enviar pesa más de lo permitido.', retry: false },
  415: { title: 'Esa acción no está permitida', detail: 'Vuelve al inicio e intenta de nuevo.', retry: false },
  429: { title: 'Demasiados intentos', detail: 'Espera un momento y vuelve a probar.', retry: true },
  500: { title: 'Algo falló de nuestro lado', detail: `${SAFE} Intenta de nuevo en un momento.`, retry: true },
  502: { title: 'El servicio no responde', detail: `No pudimos conectar. ${SAFE} Intenta de nuevo en un momento.`, retry: true },
  503: { title: 'Estamos en mantención', detail: `Volvemos en unos minutos. ${SAFE}`, retry: true },
  504: { title: 'Está tardando demasiado', detail: `No hubo respuesta a tiempo. ${SAFE} Intenta de nuevo en un momento.`, retry: true },
}

export function errorInfo(status: number): ErrorInfo {
  const s = Number.isInteger(status) && status >= 0 ? status : 500
  const known = KNOWN[s] ?? (s >= 500 ? KNOWN[500]! : s >= 400 ? KNOWN[400]! : KNOWN[500]!)
  return { status: s, code: s > 0 ? String(s) : '', ...known }
}

/** El navegador pide una página (alguien abrió la dirección); la app pide datos */
export const wantsHtml = (accept: string | null): boolean => !!accept && accept.toLowerCase().includes('text/html')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Página de error completa y autónoma: sin archivos externos ni código, clara de día y de noche */
export function errorPageHtml(status: number): string {
  const e = errorInfo(status)
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#FDE2E4">
<title>${esc(e.title)} · Contigo</title>
<style>
:root{--bg:#fde2e4;--card:#fff6f7;--text:#3a3350;--muted:#5a5074;--accent:#8ccbd6;--ink:#3a3350;--code:#1f5a66;--line:#f0c4d3}
@media (prefers-color-scheme:dark){:root{--bg:#1d1828;--card:#282238;--text:#fdeaed;--muted:#b9afd0;--accent:#bee1e6;--ink:#1d1828;--code:#bee1e6;--line:#433b5e}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{width:100%;max-width:420px;padding:32px 24px;border-radius:24px;background:var(--card);border:1px solid var(--line);text-align:center}
.code{margin:0;font-size:72px;line-height:1;font-weight:800;letter-spacing:-2px;color:var(--code)}
h1{margin:12px 0 8px;font-size:22px;line-height:28px}
p{margin:0;color:var(--muted);font-size:16px;line-height:24px}
nav{display:flex;flex-direction:column;gap:10px;margin-top:24px}
a{display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:999px;font-size:16px;font-weight:700;text-decoration:none}
a.main{background:var(--accent);color:var(--ink)}
a.alt{color:var(--text);border:1.5px solid var(--line)}
a:focus-visible{outline:3px solid var(--code);outline-offset:3px}
</style>
</head>
<body>
<main>
${e.code ? `<p class="code" aria-hidden="true">${esc(e.code)}</p>` : ''}
<h1>${esc(e.title)}</h1>
<p>${esc(e.detail)}</p>
<nav>
${e.retry ? '<a class="main" href="">Reintentar</a>\n<a class="alt" href="/">Volver al inicio</a>' : '<a class="main" href="/">Volver al inicio</a>'}
</nav>
</main>
</body>
</html>
`
}
