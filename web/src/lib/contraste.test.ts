// Copyright (c) 2026 Dinovance
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

function tokens(selector: RegExp): Record<string, string> {
  const m = css.match(selector)
  const out: Record<string, string> = {}
  for (const [, k, v] of (m?.[1] ?? '').matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[k!] = v!
  return out
}
const light = tokens(/:root \{([\s\S]*?)\n\}/)
const dark = { ...light, ...tokens(/:root\[data-theme='dark'\] \{([\s\S]*?)\n\}/) }

const lin = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
export function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

const themes = { claro: light, oscuro: dark } as const
// [descripción, texto/primer plano, fondo, mínimo]
const PAIRS: [string, string, string, number][] = [
  ['título de la ventana (--text sobre --surface)', 'text', 'surface', 4.5],
  ['tarjeta de movimiento: texto', 'text', 'surface', 4.5],
  ['texto .muted sobre --surface', 'muted', 'surface', 4.5],
  ['botón primario «Aceptar» (--ink sobre --accent)', 'ink', 'accent', 4.5],
  ['botón secundario «Ahora no» (--text sobre --surface)', 'text', 'surface', 4.5],
  ['botones secundarios chicos (--accent-ink sobre --surface)', 'accent-ink', 'surface', 4.5],
  ['borde del botón secundario (--field-line sobre --surface)', 'field-line', 'surface', 3],
  ['interruptor apagado: borde (--field-line sobre --surface)', 'field-line', 'surface', 3],
  ['interruptor encendido: borde (--accent-ink sobre --surface)', 'accent-ink', 'surface', 3],
  ['interruptor encendido: círculo (--ink sobre --accent)', 'ink', 'accent', 3],
  ['anillo de foco (--accent-ink sobre --surface)', 'accent-ink', 'surface', 3],
  ['anillo de foco sobre el fondo (--accent-ink sobre --bg)', 'accent-ink', 'bg', 3],
]

describe('contraste WCAG AA (tokens de styles.css)', () => {
  for (const [theme, t] of Object.entries(themes)) {
    it.each(PAIRS)(`${theme}: %s`, (_d, fg, bg, min) => {
      expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(min)
    })
  }
  it('imprime los ratios medidos', () => {
    const rows = Object.entries(themes).flatMap(([n, t]) => PAIRS.map(([d, fg, bg]) => `${n} ${ratio(t[fg]!, t[bg]!).toFixed(2)} ${d}`))
    console.info(rows.join('\n'))
    expect(rows.length).toBe(PAIRS.length * 2)
  })
  it('el foco visible tiene anillo de al menos 2 px en botones, interruptores y opciones', () => {
    expect(css).toMatch(/\.btn:focus-visible[\s\S]{0,200}outline: [23]px solid var\(--accent-ink\)/)
    expect(css).toMatch(/\.switch:focus-visible\s*\{ outline: 2px solid var\(--accent-ink\)/)
    expect(css).toMatch(/\.radio-opt:focus-visible \{ outline: 3px/)
  })
})
