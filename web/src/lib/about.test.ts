import { describe, expect, it } from 'vitest'
import { BUILD_DATE, COPYRIGHT_HOLDER, VERSION, checkForUpdate, copyright } from './about'

describe('acerca de', () => {
  it('el copyright es de Dinovance y arranca en 2026', () => {
    expect(COPYRIGHT_HOLDER).toBe('Dinovance')
    expect(copyright()).toMatch(/^© 2026(–\d{4})? Dinovance\. Todos los derechos reservados\.$/)
  })

  it('la versión sale de package.json y la fecha de compilación es válida', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(Number.isNaN(BUILD_DATE.getTime())).toBe(false)
  })

  it('sin service worker avisa que no se puede buscar actualizaciones', async () => {
    expect(await checkForUpdate()).toBe('unsupported')
  })
})
