import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return '' // compilando sin git (por ejemplo, en un servidor de build): se omite
  }
})()

export default defineConfig(({ command, mode }) => {
  // .env.local tiene prioridad sobre .env.production: sin este control, el build que se sube a
  // Cloudflare puede quedar apuntando al Supabase local (http://127.0.0.1:54321).
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build' && mode === 'production' && !env.ALLOW_LOCAL_BUILD) {
    if (!env.VITE_TURNSTILE_SITE_KEY) {
      throw new Error('Falta VITE_TURNSTILE_SITE_KEY: sin ella nadie puede registrarse ni iniciar sesión (Supabase exige el captcha). Ponla en .env.production.local.')
    }
    if (env.VITE_TURNSTILE_SITE_KEY.startsWith('1x0000')) {
      throw new Error('VITE_TURNSTILE_SITE_KEY es la clave de PRUEBA de Cloudflare. Usa la real en .env.production.local.')
    }
  }
  // Desarrollo y vista previa: «/supabase» se reenvía al Supabase local con la clave puesta aquí, no en el navegador
  const target = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_KEY || env.VITE_SUPABASE_KEY
  const supabaseProxy: ProxyOptions | undefined =
    target && command === 'serve'
      ? {
          target,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/supabase/, '').replace(/apikey=[^&]+/, `apikey=${key}`),
          configure: (p) => {
            p.on('proxyReq', (req) => {
              req.setHeader('apikey', key ?? '')
              // La clave de relleno nunca debe llegar a Supabase como si fuera una sesión
              if (String(req.getHeader('authorization') ?? '').includes('sb_publishable_via_proxy')) {
                req.setHeader('authorization', `Bearer ${key}`)
              }
            })
          },
        }
      : undefined
  const proxy = supabaseProxy ? { '/supabase': supabaseProxy } : undefined

  return {
    server: { proxy },
    preview: { proxy },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
      __COMMIT__: JSON.stringify(commit),
    },
    plugins: [
      react(),
      {
        // Red de seguridad: si algún día la dirección real o una clave real se cuela en el código, el build falla
        name: 'no-leak-supabase-url',
        generateBundle(_o, bundle) {
          if (command !== 'build') return
          const secrets = [env.VITE_SUPABASE_URL, env.SUPABASE_URL, env.VITE_SUPABASE_KEY, env.SUPABASE_KEY].filter((x): x is string => !!x && x.length > 12)
          for (const [name, file] of Object.entries(bundle)) {
            const text = file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : ''
            const leaked = secrets.find((x) => text.includes(x))
            if (leaked) throw new Error(`El archivo ${name} contiene la dirección o la clave real de Supabase. Debe ir solo en el proxy.`)
          }
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'Contigo',
          short_name: 'Contigo',
          description: 'Las finanzas de los dos, en un solo lugar',
          lang: 'es-CL',
          theme_color: '#FDE2E4',
          background_color: '#FDE2E4',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          id: '/',
          scope: '/',
          categories: ['finance', 'productivity'],
          display_override: ['standalone', 'minimal-ui'],
          prefer_related_applications: false,
          shortcuts: [
            { name: 'Registrar un gasto', short_name: 'Registrar', url: '/?tab=add', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Ver mis gastos', short_name: 'Gastos', url: '/?tab=expenses', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Mis metas', short_name: 'Metas', url: '/?tab=goals', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
          ],
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          // Las pantallas de auth del correo y los archivos con extensión nunca caen en el index
          navigateFallbackDenylist: [/^\/auth\//, /^\/supabase\//, /\.[a-z0-9]+$/i],
          importScripts: ['push-sw.js'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          // Datos financieros: el proxy de Supabase y el captcha JAMÁS se guardan en la caché del service worker
          runtimeCaching: [
            { urlPattern: ({ url }) => url.pathname.startsWith('/supabase/'), handler: 'NetworkOnly' },
            { urlPattern: ({ url }) => url.hostname === 'challenges.cloudflare.com', handler: 'NetworkOnly' },
          ],
        },
      }),
    ],
  }
})
