// Copyright (c) 2026 Dinovance
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PayChips from './PayChips'

describe('PayChips', () => {
  it('muestra «Cuota $100.000» y «Pagar todo $1.056.339»', () => {
    const html = renderToStaticMarkup(<PayChips monthlyPayment={100_000} remaining={1_056_339} onPick={() => {}} />)
    expect(html).toContain('Cuota $100.000')
    expect(html).toContain('Pagar todo $1.056.339')
  })
  it('sin cuota solo ofrece pagar todo', () => {
    const html = renderToStaticMarkup(<PayChips monthlyPayment={0} remaining={50_000} onPick={() => {}} />)
    expect(html).not.toContain('Cuota')
    expect(html).toContain('Pagar todo $50.000')
  })
})
