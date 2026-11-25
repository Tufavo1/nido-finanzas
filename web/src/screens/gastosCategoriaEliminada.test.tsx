// Copyright (c) 2026 Dinovance
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Expenses from './Expenses'

const me = { user_id: 'yo', display_name: 'Ana', color: 'blue', household_id: 'h', joined_at: '' }
const hh = { household: { id: 'h', name: 'Casa', invite_code: null, created_at: '' }, members: [me], me, everyone: [me] } as never
const exp = (id: string, category_id: string, amount: number) => ({ id, household_id: 'h', category_id, amount, paid_by: 'yo', shared: false, note: 'x', spent_on: '2026-11-10', created_at: '' })
const data = {
  categories: [{ id: 'c1', household_id: 'h', name: 'Supermercado', monthly_budget: 300_000, position: 1, archived: false }],
  // $238.000 en una categoría que ya no existe y $50.000 en una viva
  expenses: [exp('e1', 'borrada', 238_000), exp('e2', 'c1', 50_000)],
  prevExpenses: [],
  goals: [],
  contributions: [],
  recurring: [],
  debts: [],
  debtPayments: [],
  refresh: async () => {},
} as never

describe('Gastos: «Tu gasto frente al límite» incluye lo de categorías eliminadas', () => {
  it('muestra «Categoría eliminada» con $238.000 para que las categorías sumen el total', () => {
    const html = renderToStaticMarkup(<Expenses hh={hh} data={data} month={new Date(2026, 10, 15)} onToast={() => {}} scope="yo" onScope={() => {}} />)
    const from = html.indexOf('Tu gasto frente al límite')
    expect(from).toBeGreaterThan(-1)
    const section = html.slice(from, html.indexOf('Tu historial de gastos', from))
    expect(section).toContain('Categoría eliminada')
    expect(section).toContain('$238.000')
    expect(section).toContain('Sin límite')
  })
})
