// Copyright (c) 2026 Dinovance
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { saveLabel } from '../lib/register'

// «Más opciones» es una hoja inferior (Modal): el diseño principal no cambia de alto al abrirla y Guardar nunca tapa el teclado.
// No hay DOM: se fija la estructura del JSX y se hace la cuenta de alturas sobre el CSS real.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const css = read('../styles.css').replace(/\/\*[\s\S]*?\*\//g, '')
const register = read('./Register.tsx')

function balanced(text: string, start: number): string {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '{' || c === '(') depth++
    else if (c === '}' || c === ')') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error('el bloque no cierra')
}
function bodies(text: string, selector: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) out.push(m[2]!)
  }
  return out
}
const px = (text: string, selector: string, prop: string): number | null => {
  let v: number | null = null
  for (const b of bodies(text, selector)) {
    const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*(?:calc\\(env\\([^)]*\\)\\s*\\+\\s*)?(\\d+)px`).exec(b)
    if (m) v = Number(m[1])
  }
  return v
}
function media(query: string): string {
  const start = css.indexOf(query)
  expect(start, `falta ${query}`).toBeGreaterThan(-1)
  return balanced(css, css.indexOf('{', start)).slice(1, -1)
}
/** El CSS sin los bloques @media (reglas base) */
function baseCss(): string {
  let out = ''
  let i = 0
  while (i < css.length) {
    const at = css.indexOf('@media', i)
    if (at === -1) return out + css.slice(i)
    out += css.slice(i, at)
    i = css.indexOf('{', at)
    i += balanced(css, i).length
  }
  return out
}

describe('Registrar: «Más opciones» es una hoja inferior', () => {
  const start = register.indexOf('{more && (')
  const block = balanced(register, start)
  it('el bloque abre un Modal con fecha, quién pagó, descuento y «Listo»', () => {
    expect(start).toBeGreaterThan(-1)
    expect(block).toContain('<Modal')
    expect(block).toContain('id="spent-on"')
    expect(block).toContain('aria-label="Quién pagó"')
    expect(block).toContain('id="reg-disc"')
    expect(block).toContain('Listo')
    expect(block).not.toContain('keypad')
  })
  it('el bloque cierra antes del teclado y Guardar, que quedan fuera de él', () => {
    const end = start + block.length
    expect(register.indexOf('className="keypad reg-keys"')).toBeGreaterThan(end)
    expect(register.indexOf('className="btn reg-save" type="button"')).toBeGreaterThan(end)
  })
  it('el botón no cambia de texto (no hay bloque que crezca en la pantalla)', () => {
    expect(register).not.toContain('Menos opciones')
    expect(register).toContain("aria-haspopup=\"dialog\"")
  })
  it('el texto de Guardar sigue diciendo qué falta', () => {
    expect(saveLabel('amount', 0)).toBe('Escribe el monto')
    expect(saveLabel('category', 5000)).toBe('Elige la categoría')
  })
})

describe('Registrar: Guardar nunca tapa el teclado (cuenta de alturas)', () => {
  const TABBAR = 84
  const STATUS = 24
  /** Alto del contenido de Registrar con teclas y Guardar; encabezado, nota, categorías, Compartido/Personal y «Más opciones» de 48 px */
  function content(rules: string, noteH: number): number {
    const key = px(rules, '.screen.reg .reg-keys .key', 'height')!
    const keyGap = px(rules, '.screen.reg .reg-keys', 'gap')!
    const gap = px(rules, '.screen.reg', 'gap')!
    const padTop = px(rules, '.screen.reg', 'padding-top')!
    const amount = px(rules, '.screen.reg .reg-amount', 'min-height')!
    const save = px(css, '.screen.reg .reg-save', 'min-height')!
    const keypad = 4 * key + 3 * keyGap
    const blocks = [48, amount, noteH, 48, 48, 48, keypad, save]
    return padTop + blocks.reduce((a, b) => a + b, 0) + gap * (blocks.length - 1)
  }
  const tall = media('@media (max-height: 900px)')
  const short = media('@media (max-height: 700px)')
  const stickyMin = /@media \(min-height: (\d+)px\)\s*\{[^{}]*\.screen\.reg \.reg-save\s*\{[^{}]*position:\s*sticky/.exec(css)

  it('fuera de las pantallas altas, Guardar no es sticky (queda después del teclado)', () => {
    expect(baseCss()).not.toMatch(/\.screen\.reg \.reg-save\s*\{[^}]*position:\s*sticky/)
    expect(stickyMin, 'falta el sticky dentro de @media (min-height)').not.toBeNull()
  })
  it('360x800: cabe todo sin desplazar y Guardar puede ser sticky', () => {
    const fits = content(tall, 52) + TABBAR + STATUS
    expect(fits).toBeLessThanOrEqual(800)
    expect(Number(stickyMin![1])).toBeLessThanOrEqual(800)
  })
  it('el umbral del sticky cubre el contenido compacto: donde no cabe, no hay sticky', () => {
    expect(Number(stickyMin![1])).toBeGreaterThanOrEqual(content(tall, 52) + TABBAR + STATUS)
  })
  it('360x533: no cabe, así que Guardar queda en el flujo (la página se desplaza) y las teclas siguen en 48 px', () => {
    const needed = content(short, 48) + TABBAR + STATUS
    expect(needed).toBeGreaterThan(533)
    expect(Number(stickyMin![1])).toBeGreaterThan(533)
    expect(px(short, '.screen.reg .reg-keys .key', 'height')).toBeGreaterThanOrEqual(48)
  })
  it('en pantallas bajas las categorías van en una sola fila', () => {
    expect(css).toMatch(/\.reg-catrow\s*\{[^}]*flex-wrap:\s*nowrap/)
  })
})
