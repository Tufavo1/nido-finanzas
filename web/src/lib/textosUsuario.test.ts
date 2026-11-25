// Copyright (c) 2026 Dinovance
// Nada técnico llega a la pantalla: ni «migración» ni el texto crudo de un error del servidor.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const files = ['components', 'screens'].flatMap((d) => readdirSync(join(root, d)).filter((f) => f.endsWith('.tsx') && !f.includes('.test.')).map((f) => join(root, d, f)))
const lines = (f: string) => readFileSync(f, 'utf8').split('\n').map((t, i) => ({ t, n: i + 1 })).filter(({ t }) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(t))

describe('textos al usuario', () => {
  it('ninguna pantalla habla de «migración»', () => {
    const bad = files.flatMap((f) => lines(f).filter(({ t }) => /migraci[oó]n/i.test(t)).map(({ n }) => `${f}:${n}`))
    expect(bad).toEqual([])
  })
  it('ningún error se muestra con su texto crudo (.message) sin pasar por friendlyError/userMessage', () => {
    const bad = files.flatMap((f) => lines(f).filter(({ t }) => /setError\((?!friendlyError|userMessage)[^)]*\.message/.test(t)).map(({ n }) => `${f}:${n}`))
    expect(bad).toEqual([])
  })
})
