// Copyright (c) 2026 Dinovance
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AmountChoices from './AmountChoices'
import { BankSwitchRow, FirstUseCard, StatusLine } from './AutoExpenses'
import { captureHeadline } from '../lib/nativeSettings'

const noop = () => undefined
const base = { listenerAllowed: true, enabled: true, revoked: false, activeBanks: ['Banco Falabella'], health: null }

describe('Gastos automáticos: primer uso (Hick)', () => {
  it('una tarjeta y un único botón: «Conectar mi banco»', () => {
    const html = renderToStaticMarkup(<FirstUseCard onConnect={noop} />)
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('Conectar mi banco')
    expect(html).not.toMatch(/role="switch"/)
  })
})

describe('Gastos automáticos: estado en una línea', () => {
  it('leyendo: sin botón de arreglo', () => {
    const html = renderToStaticMarkup(<StatusLine headline={captureHeadline(base)} onAction={noop} />)
    expect(html).toContain('Leyendo los avisos de Banco Falabella')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('<button')
  })
  it('sin acceso: dice qué falta y trae el botón que lo arregla', () => {
    const html = renderToStaticMarkup(<StatusLine headline={captureHeadline({ ...base, listenerAllowed: false })} onAction={noop} />)
    expect(html).toContain('Falta activar el acceso')
    expect(html).toContain('Activar el acceso')
    expect(html.match(/<button/g)).toHaveLength(1)
  })
})

describe('interruptor por banco', () => {
  it('tiene nombre, estado y rol de interruptor para el lector de pantalla', () => {
    const on = renderToStaticMarkup(<BankSwitchRow id="banco-falabella" name="Banco Falabella" on busy={false} onChange={noop} />)
    expect(on).toContain('role="switch"')
    expect(on).toContain('aria-checked="true"')
    expect(on).toContain('aria-labelledby="auto-bank-banco-falabella"')
    expect(on).toContain('Activado')
    const off = renderToStaticMarkup(<BankSwitchRow id="santander" name="Santander" on={false} busy={false} onChange={noop} />)
    expect(off).toContain('aria-checked="false"')
    expect(off).toContain('Apagado')
  })
})

describe('«Guardar solo hasta»: montos listos', () => {
  it('marca el actual y deja el resto a un toque', () => {
    const html = renderToStaticMarkup(<AmountChoices label="Monto" value={50_000} onPick={noop} />)
    expect(html).toContain('role="group"')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toContain('$100.000')
  })
})
