// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { NEEDS, needsFor } from './needs'

describe('needsFor', () => {
  it('web: todo igual', () => expect(needsFor(false)).toEqual(NEEDS))
  it('nativo: sin instalar y sin palabras de la web', () => {
    const n = needsFor(true)
    expect(n.some((x) => x.id === 'install')).toBe(false)
    expect(JSON.stringify(n)).not.toMatch(/instal|navegador|bloqueador|pantalla completa|pwa/i)
  })
})
