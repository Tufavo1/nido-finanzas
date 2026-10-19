import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
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
    if (!env.VITE_SUPABASE_URL?.startsWith('https://')) {
      throw new Error(`VITE_SUPABASE_URL debe ser https:// en producción (es "${env.VITE_SUPABASE_URL}"). Usa .env.production.local.`)
    }
    if (env.VITE_TURNSTILE_SITE_KEY?.startsWith('1x0000')) {
      throw new Error('VITE_TURNSTILE_SITE_KEY es la clave de PRUEBA de Cloudflare. Usa la real en .env.production.local.')
    }
  }
  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
      __COMMIT__: JSON.stringify(commit),
    },
    plugins: [
      react(),
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
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: { navigateFallback: '/index.html', importScripts: ['push-sw.js'] },
      }),
    ],
  }
})
