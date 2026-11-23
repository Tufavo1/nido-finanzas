// Copyright (c) 2026 Dinovance
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { isNative, platform } from './platform'

/** Colores de fondo de la app (los mismos de styles.css): la barra de estado debe coincidir (CA-14-3) */
const BG = { light: '#fde2e4', dark: '#1d1828' }

/** Estilo de la barra de estado: en tema oscuro el texto es claro. */
export function statusBarFor(dark: boolean): { style: 'DARK' | 'LIGHT'; color: string } {
  return dark ? { style: 'DARK', color: BG.dark } : { style: 'LIGHT', color: BG.light }
}

const isDark = (): boolean => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)

async function syncStatusBar(): Promise<void> {
  const s = statusBarFor(isDark())
  await StatusBar.setStyle({ style: s.style === 'DARK' ? Style.Dark : Style.Light })
  if (platform() === 'android') await StatusBar.setBackgroundColor({ color: s.color })
}

/** Al abrir el teclado, el campo con foco se desplaza para quedar visible (RF-12) */
function keepFocusVisible(): void {
  void Keyboard.addListener('keyboardDidShow', () => {
    const el = document.activeElement
    if (el instanceof HTMLElement && el.matches('input, textarea, select')) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

/** Barra de estado, teclado y cierre del splash. En el navegador no hace nada. */
export function setupNativeChrome(): void {
  if (!isNative()) return
  document.documentElement.classList.add('native')
  void syncStatusBar()
  new MutationObserver(() => void syncStatusBar()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void syncStatusBar())
  keepFocusVisible()
}

/** Quita el splash cuando ya hay algo que mostrar (sin destello en blanco). */
export function hideSplash(): void {
  if (isNative()) void SplashScreen.hide({ fadeOutDuration: 150 })
}
