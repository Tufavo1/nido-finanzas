// Copyright (c) 2026 Dinovance
/// <reference types="node" />
// Ajustes > Gastos automáticos > «Avisos que no pude leer»: el esqueleto depende de `issues === null`, y solo loadIssues()
// (con el tope de 8 s) lo saca de ahí. Cualquier camino que abra «Avanzado» sin pedir los avisos deja el esqueleto para siempre:
// el tope nunca corre porque no hay llamada que esperar (se vio en el emulador al entrar por «Elegir app»).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const code = readFileSync(new URL('../components/AutoExpenses.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('«Avisos que no pude leer» nunca queda cargando sin tope', () => {
  it('la lectura de los avisos va envuelta en el tope de tiempo', () => {
    expect(code).toMatch(/withDeadline\(api\.getCaptureDiagnostics\(\), DIAGNOSTICS_DEADLINE_MS\)/)
  })
  it('todo camino que abre «Avanzado» pide los avisos', () => {
    // Cada setAdvanced(true) va justo después de loadIssues() (la línea anterior)
    const lines = code.split('\n')
    const opens = lines.flatMap((l, i) => (/setAdvanced\(true\)/.test(l) ? [i] : []))
    expect(opens.length).toBeGreaterThan(0)
    for (const i of opens) expect(lines[i - 1]).toMatch(/loadIssues\(\)/)
  })
})
