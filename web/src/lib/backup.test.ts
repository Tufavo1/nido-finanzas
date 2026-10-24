import { describe, expect, it, vi } from 'vitest'
import { csvCell, expensesCsv, readAll } from './backup'
import type { Backup } from './backup'

// Base falsa con 2.500 filas sintéticas: solo entrega páginas estables si se pidió orden
const fake = vi.hoisted(() => ({ orders: [] as string[] }))
vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      const rows = Array.from({ length: 2500 }, (_, i) => ({ id: String(i).padStart(5, '0') }))
      const builder = {
        select: () => builder,
        order: (col: string) => {
          fake.orders.push(col)
          return builder
        },
        range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      }
      return builder
    },
  },
}))

describe('readAll', () => {
  it('pagina con orden por clave primaria y no pierde ni repite filas', async () => {
    fake.orders.length = 0
    const rows = await readAll('expenses')
    expect(rows).toHaveLength(2500)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2500)
    expect(fake.orders).toEqual(['id', 'id', 'id'])
  })
  it('ordena members por su clave compuesta', async () => {
    fake.orders.length = 0
    await readAll('members')
    expect(fake.orders.slice(0, 2)).toEqual(['household_id', 'user_id'])
  })
})

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
