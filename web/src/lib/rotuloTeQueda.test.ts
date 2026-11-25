// Copyright (c) 2026 Dinovance
// Un solo rótulo para la misma cifra: «Te queda». Ninguna pantalla ni texto de ayuda usa los nombres antiguos.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const src = walk(join(__dirname, '..')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('.test.'))

describe('rótulo «Te queda»', () => {
  it('no quedan «Libre de verdad» ni «Te queda del sueldo» en textos visibles', () => {
    const bad = src.filter((f) => /Libre de verdad|Te queda del sueldo|lo que te queda del sueldo/i.test(readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')))
    expect(bad).toEqual([])
  })
})
