// Copyright (c) 2026 Dinovance
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Goals from './Goals'

const me = { user_id: 'yo', display_name: 'Ana', color: 'blue', household_id: 'h', joined_at: '' }
const par = { user_id: 'pareja', display_name: 'Luis', color: 'amber', household_id: 'h', joined_at: '' }
const hh = { household: { id: 'h', name: 'Casa', invite_code: null, created_at: '' }, members: [me, par], me, everyone: [me, par] } as never
const goal = (id: string, name: string, target: number) => ({ id, name, target_amount: target, target_date: null, archived: false, household_id: 'h', created_at: '' })
const data = {
  goals: [goal('ojos', 'Operación Ojos', 970_000), goal('a', 'Viaje', 8_000_000), goal('b', 'Auto', 6_000_000), goal('c', 'Casa', 4_000_000)],
  // $100.000 aportados por la pareja a «Operación Ojos»
  contributions: [{ id: 'c1', goal_id: 'ojos', user_id: 'pareja', household_id: 'h', amount: 100_000, contributed_on: '2026-11-01' }],
  categories: [],
  refresh: async () => {},
} as never
const render = (scope: string) => renderToStaticMarkup(<Goals hh={hh} data={data} onToast={() => {}} scope={scope} onScope={() => {}} />)

describe('Metas: el resumen y cada meta no se contradicen', () => {
  it('mirando «Yo»: el resumen muestra lo ahorrado en la meta ($100.000), no $0', () => {
    const html = render('yo')
    expect(html).toContain('Ahorrado en total')
    expect(html).toContain('$100.000')
    expect(html).toContain('de $18.970.000')
    expect(html).toContain('10 % de $970.000')
  })
  it('mirando «Yo»: lo aportado por ti se ve aparte, en $0', () => {
    const html = render('yo')
    expect(html).toContain('Aportado por ti')
    expect(html).not.toMatch(/Aportado por ti<\/span><span class="amount small num">\$0/)
  })
  it('hay botón «Crear meta» aunque ya existan metas', () => {
    expect(render('all')).toContain('Crear meta')
  })
})
