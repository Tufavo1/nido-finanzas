// Copyright (c) 2026 Dinovance
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Guardar tiene que verse entero al abrir Registrar, sin deslizar y sin que la barra inferior lo tape.
// No hay DOM: se fija el CSS real y se hace la cuenta de alturas.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const css = read('../styles.css').replace(/\/\*[\s\S]*?\*\//g, '')
const register = read('./Register.tsx')

/** Cuerpo de TODAS las reglas cuyo selector (de una lista) es exactamente este, dentro del texto dado */
function bodies(text: string, selector: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) out.push(m[2]!)
  }
  return out
}
const lastPx = (text: string, selector: string, prop: string): number | null => {
  let v: number | null = null
  for (const b of bodies(text, selector)) {
    const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*(?:calc\\(env\\([^)]*\\)\\s*\\+\\s*)?(\\d+)px`).exec(b)
    if (m) v = Number(m[1])
  }
  return v
}
/** Bloque `@media (max-height: ...) { ... }` completo (balanceando llaves) */
function mediaBlock(query: string): string {
  const start = css.indexOf(query)
  expect(start, `falta ${query}`).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error('el bloque @media no cierra')
}

describe('Registrar: Guardar visible entero', () => {
  it('Guardar queda pegado al borde de abajo del área que se desliza (nunca bajo la barra)', () => {
    const all = bodies(css, '.screen.reg .reg-save').join(';')
    expect(all).toMatch(/position:\s*sticky/)
    expect(all).toMatch(/bottom:\s*0/)
    expect(all).toMatch(/z-index:\s*\d+/)
    expect(all).toMatch(/background:/)
  })
  it('el contenedor deja espacio abajo para la barra flotante y el área segura', () => {
    const all = bodies(css, '.screen.reg').join(';')
    expect(all).toMatch(/padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)/)
  })
  it('en pantallas bajas se compactan márgenes y chips, y las teclas siguen en 48 px o más', () => {
    for (const q of ['@media (max-height: 900px)', '@media (max-height: 700px)']) {
      const m = mediaBlock(q)
      expect(lastPx(m, '.screen.reg', 'padding-top'), q).toBeLessThan(24)
      expect(bodies(m, '.screen.reg').join(';'), q).toMatch(/gap:\s*\d+px/)
      expect(lastPx(m, '.screen.reg .reg-keys .key', 'height'), q).toBeGreaterThanOrEqual(48)
    }
    expect(lastPx(css, '.screen.reg .reg-keys .key', 'height')).toBeGreaterThanOrEqual(48)
  })
  it('la cuenta de alturas cabe en 360x800 (barra y barra de estado incluidas) con las reglas compactas', () => {
    const m = mediaBlock('@media (max-height: 900px)')
    const key = lastPx(m, '.screen.reg .reg-keys .key', 'height')!
    const keyGap = lastPx(m, '.screen.reg .reg-keys', 'gap')!
    const gap = lastPx(m, '.screen.reg', 'gap')!
    const padTop = lastPx(m, '.screen.reg', 'padding-top')!
    const keypad = 4 * key + 3 * keyGap
    const amount = lastPx(m, '.screen.reg .reg-amount', 'min-height')!
    const save = lastPx(css, '.screen.reg .reg-save', 'min-height')!
    // Encabezado, nota, categorías, de quién es, «Más opciones» (48 cada uno)
    const blocks = [48, amount, 48, 48, 48, 48, keypad, save]
    const content = padTop + blocks.reduce((a, b) => a + b, 0) + gap * (blocks.length - 1)
    const tabbar = 84 // barra de abajo en el celular: tecla de 48 + márgenes
    const statusBar = 24
    expect(content + tabbar + statusBar).toBeLessThanOrEqual(800)
  })
  it('Guardar es el último bloque de la pantalla (después del teclado)', () => {
    expect(register.indexOf('className="btn reg-save" type="button"')).toBeGreaterThan(register.indexOf('className="keypad reg-keys"'))
  })
})

describe('Registrar: la fecha de «Más opciones» muestra hoy', () => {
  it('el campo de fecha se ve con la fecha de hoy cuando no se ha elegido otra', () => {
    expect(register).toMatch(/id="spent-on"[^>]*value=\{date \|\| today\}/)
  })
})
