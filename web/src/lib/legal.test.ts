import { describe, expect, it } from 'vitest'
import { LEGAL_DOCS } from './legal'

function texts(): string[] {
  return Object.values(LEGAL_DOCS).flatMap((d) => [d.title, d.intro, ...d.sections.flatMap((s) => [s.title, ...(s.paragraphs ?? []), ...(s.items ?? [])])])
}

describe('textos legales', () => {
  it('no usan punto y coma', () => {
    expect(texts().filter((t) => t.includes(';'))).toEqual([])
  })
  it('no quedan vacíos ni con espacios dobles', () => {
    for (const t of texts()) {
      expect(t.trim()).toBe(t)
      expect(t).not.toMatch(/\s{2,}/)
      expect(t.length).toBeGreaterThan(0)
    }
  })
  it('cada sección tiene contenido', () => {
    for (const d of Object.values(LEGAL_DOCS)) for (const s of d.sections) expect((s.paragraphs?.length ?? 0) + (s.items?.length ?? 0)).toBeGreaterThan(0)
  })
})
