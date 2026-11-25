// Copyright (c) 2026 Dinovance
// Decisión del dueño: por ahora la captura de avisos solo se ofrece con Banco Falabella y Billetera de Google.
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FirstUseCard, UnavailableBankRow } from './AutoExpenses'
import BankCard from './BankCard'
import { BANKS as DEBT_BANKS } from '../lib/bankData'

const noop = () => undefined
const FRASE = 'Por ahora funciona con Banco Falabella y Billetera de Google. Pronto sumaremos más bancos.'
const HIDDEN = /Santander|Banco Estado|Banco de Chile|BCI|Scotiabank|Itaú/

describe('textos de captura', () => {
  it('el primer uso dice qué sí funciona y no nombra bancos ocultos', () => {
    const html = renderToStaticMarkup(<FirstUseCard onConnect={noop} />)
    expect(html).toContain(FRASE)
    expect(html).not.toMatch(HIDDEN)
  })
  it('las fuentes del consentimiento y de Ajustes usan la misma frase', () => {
    for (const f of ['BankConsentSheet', 'CaptureSettings', 'BankAutoSection']) {
      const src = readFileSync(new URL(`./${f}.tsx`, import.meta.url), 'utf8')
      expect(src, f).toContain('CAPTURE_AVAILABLE_TEXT')
      expect(src, f).not.toMatch(HIDDEN)
    }
  })
})

describe('banco oculto con preferencia guardada', () => {
  it('se muestra como «Ya no disponible por ahora» y solo se puede apagar', () => {
    const html = renderToStaticMarkup(<UnavailableBankRow name="Santander" busy={false} onOff={noop} />)
    expect(html).toContain('Ya no disponible por ahora')
    expect(html).toContain('Apagar')
    expect(html).not.toContain('role="switch"')
  })
  it('la tarjeta de un banco oculto no ofrece asociar app ni encender', () => {
    const html = renderToStaticMarkup(<BankCard bank={{ id: 'santander', name: 'Santander', available: false, packageName: 'cl.s.app', autoSave: true }} cap={50_000} busy={false} onToggle={noop} onAssociate={noop} onDissociate={noop} />)
    expect(html).toContain('Ya no disponible por ahora')
    expect(html).toContain('Apagar')
    expect(html).not.toContain('Elegir app')
    expect(html).not.toContain('Cambiar app')
    expect(html).not.toContain('role="switch"')
  })
})

describe('deudas y tarjetas NO son captura: siguen con sus bancos chilenos', () => {
  it('el catálogo de tasas conserva Santander y compañía', () => {
    expect(DEBT_BANKS.map((b) => b.id)).toEqual(expect.arrayContaining(['falabella', 'santander']))
  })
  it('el formulario de deuda usa su propio catálogo, no el de captura', () => {
    const src = readFileSync(new URL('./DebtGuidedForm.tsx', import.meta.url), 'utf8')
    expect(src).toContain("from '../lib/bankData'")
    expect(src).not.toContain('bankAuto')
  })
})
