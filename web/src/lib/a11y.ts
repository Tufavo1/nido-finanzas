/** Lleva el foco al título de la pantalla actual. Las pantallas cargan de forma diferida: reintenta hasta que aparezca. */
export function focusMain(tries = 20): void {
  const title = document.querySelector<HTMLElement>('main h1')
  const el = title ?? (tries === 0 ? document.querySelector<HTMLElement>('main') : null)
  if (!el) {
    if (tries > 0) window.setTimeout(() => focusMain(tries - 1), 50)
    return
  }
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1
  el.focus({ preventScroll: true })
}
