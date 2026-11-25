import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Registrar es manual: no ofrece pegar ni leer «avisos del banco» (la captura automática es otra función).
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('Registrar ya no ofrece «Aviso del banco»', () => {
  const register = read('./Register.tsx')
  it('la pantalla no tiene nada del aviso pegado', () => {
    expect(register).not.toMatch(/aviso del banco|pega el aviso|leer aviso|draftFromNotice|noticeText|pasteNotice|readNotice|'notice'/i)
  })
  it('el Shell ya no le pasa un aviso a Registrar', () => {
    expect(read('../Shell.tsx')).not.toMatch(/readSharedNotice|notice=\{/)
  })
  it('el lector de texto pegado ya no existe', () => {
    expect(() => read('../lib/bankNotice.ts')).toThrow()
  })
})
