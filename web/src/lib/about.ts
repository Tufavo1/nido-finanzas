/** Datos de "Acerca de". Para cambiar el titular del copyright, edita COPYRIGHT_HOLDER. */
export const APP_NAME = 'Contigo'
export const TAGLINE = 'Tus finanzas, contigo.'
export const COPYRIGHT_HOLDER = 'Dinovance'
export const FIRST_YEAR = 2026
export const INSTAGRAM_URL = 'https://www.instagram.com/dinovance.cl'
export const INSTAGRAM_HANDLE = '@dinovance.cl'

export const VERSION = __APP_VERSION__
export const COMMIT = __COMMIT__
export const BUILD_DATE = new Date(__BUILD_DATE__)

export const copyright = (): string => {
  const year = new Date().getFullYear()
  return `© ${FIRST_YEAR === year ? FIRST_YEAR : `${FIRST_YEAR}–${year}`} ${COPYRIGHT_HOLDER}. Todos los derechos reservados.`
}

export type UpdateResult = 'up-to-date' | 'updating' | 'unsupported'

/** Pregunta al servidor si hay una versión nueva. Si la hay, la app se recarga sola al instalarla. */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'unsupported'
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  await reg.update()
  // Dar un momento a que el navegador empiece a instalar la versión nueva
  await new Promise((r) => setTimeout(r, 1500))
  return reg.installing || reg.waiting ? 'updating' : 'up-to-date'
}
