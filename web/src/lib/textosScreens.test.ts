/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Revisión de textos en el código fuente: ejemplos de montos y plurales fijos.
const SRC = new URL('..', import.meta.url).pathname
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}
const files = walk(SRC).map((p) => ({ p, text: readFileSync(p, 'utf8') }))

describe('textos de las pantallas', () => {
  it('los ejemplos de monto llevan punto de miles («Ej. 65.000», no «Ej. 65000»)', () => {
    const bad = files.flatMap(({ p, text }) => (text.match(/Ej\. \d{4,}/g) ?? []).map((m) => `${p.replace(SRC, '')}: ${m}`))
    expect(bad).toEqual([])
  })
  it('ningún contador va con plural fijo («deudas más», «metas más»…)', () => {
    const bad = files.flatMap(({ p, text }) => (text.match(/\$\{[^}]+\} (deudas|metas|gastos|gastos fijos|categorías) más/g) ?? []).map((m) => `${p.replace(SRC, '')}: ${m}`))
    expect(bad).toEqual([])
  })
  it('el rótulo de la pestaña de aportes a metas cabe en una línea', () => {
    const reg = readFileSync(join(SRC, 'screens/Register.tsx'), 'utf8')
    expect(reg).not.toMatch(/label: 'Aportar a meta'/)
  })
  it('el botón «Crear» cambia a ícono de cerrar cuando el menú está abierto', () => {
    const reg = readFileSync(join(SRC, 'screens/Register.tsx'), 'utf8')
    expect(reg).toMatch(/name=\{others \? 'close' : 'plus'\}/)
  })
})
