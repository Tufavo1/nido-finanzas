import { describe, expect, it } from 'vitest'
import { csvCell, expensesCsv } from './backup'
import type { Backup } from './backup'

describe('csvCell', () => {
  it('neutraliza fórmulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('@cmd')).toBe("'@cmd")
  })
  it('escapa comas y comillas', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('di "hola"')).toBe('"di ""hola"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell(1500)).toBe('1500')
  })
})

describe('expensesCsv', () => {
  it('arma filas con categoría y quién pagó', () => {
    const b = {
      tables: {
        categories: [{ id: 'c1', name: 'Ocio' }],
        members: [{ user_id: 'u1', display_name: 'Ana' }],
        expenses: [{ spent_on: '2026-10-02', amount: 5000, category_id: 'c1', note: 'Cine', paid_by: 'u1', shared: true, recurring_id: null }],
      },
    } as unknown as Backup
    const csv = expensesCsv(b)
    expect(csv).toContain('2026-10-02,5000,Ocio,Cine,Ana,Compartido,No')
  })
})
