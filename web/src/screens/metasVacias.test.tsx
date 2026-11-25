// Copyright (c) 2026 Dinovance
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Goals from './Goals'

const me = { user_id: 'a', display_name: 'Ana', color: 'blue', household_id: 'h', joined_at: '' }
const hh = { household: { id: 'h', name: 'Casa', invite_code: null, created_at: '' }, members: [me], me, everyone: [me] } as never
const data = { goals: [], contributions: [], categories: [], refresh: async () => {} } as never

describe('Metas vacía', () => {
  it('ofrece el botón «Crear meta» y no manda a «Registrar»', () => {
    const html = renderToStaticMarkup(<Goals hh={hh} data={data} onToast={() => {}} scope="all" onScope={() => {}} />)
    expect(html).toContain('Aún no tienen metas')
    expect(html).toContain('Crear meta')
    expect(html).not.toContain('desde «Registrar»')
  })
})
