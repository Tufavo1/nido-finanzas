// Copyright (c) 2026 Dinovance
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// QA ronda 2 (TypeScript): paridad con el parser Kotlin y cierre del camino de cola de H-02.
const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('R2-11 evidencia (debe pasar)', () => {
  it('el camino de guardado sin red pasa el id del gasto a la cola (H-02 cerrado)', () => {
    expect(src('./useDetected.ts')).toMatch(/enqueueWithNotice\(queue, \{ \.\.\.form, id \}/)
    expect(src('../screens/Register.tsx')).toMatch(/enqueueWithNotice\(queue, \{ \.\.\.form, id \}/)
  })
  it('cerrar sesión y cambiar de cuenta llaman al plugin nativo', () => {
    const s = src('./wipe.ts')
    expect(s).toMatch(/ContigoNative\.wipe\(\)/)
    expect(s).toMatch(/wipeForAccountSwitch/)
  })
})
