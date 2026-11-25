import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SavedAsChoice } from './AutoExpenses'

const noop = () => undefined

describe('Gastos automáticos: «Los gastos detectados se guardan como»', () => {
  it('muestra las dos opciones y marca Personales cuando no se eligió compartir', () => {
    const html = renderToStaticMarkup(<SavedAsChoice shared={false} busy={false} onPick={noop} />)
    expect(html).toContain('Los gastos detectados se guardan como')
    expect(html).toContain('role="group"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Personales</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Compartidos</)
  })
  it('con Compartidos elegido lo marca y avisa que la pareja los ve', () => {
    const html = renderToStaticMarkup(<SavedAsChoice shared busy={false} onPick={noop} />)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Compartidos</)
    expect(html).toContain('tu pareja')
  })
  it('está en la pantalla principal de Gastos automáticos y guarda la elección en autoShared', () => {
    const t = readFileSync(new URL('./AutoExpenses.tsx', import.meta.url), 'utf8')
    expect(t).toMatch(/<SavedAsChoice[^>]*shared=\{config\.autoShared\}/)
    expect(t).toMatch(/autoShared: v/)
  })
})
