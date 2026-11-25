import { describe, expect, it } from 'vitest'
import { detectedNote } from './detectedNote'

describe('detectedNote: la nota de un movimiento detectado, con cada frase terminada en punto', () => {
  it('categoría y origen quedan como dos frases separadas', () => {
    expect(detectedNote({ category: 'Ocio', source: 'Shell', installment: null })).toBe('Categoría sugerida: Ocio.\nDetectado desde Shell.')
  })
  it('sin categoría avisa que no se sabe', () => {
    expect(detectedNote({ category: null, source: null, installment: null })).toBe('Aún no sabemos la categoría.')
  })
  it('incluye la cuota', () => {
    expect(detectedNote({ category: 'Ocio', source: null, installment: { n: 2, total: 6 } })).toBe('Categoría sugerida: Ocio.\nCuota 2 de 6.')
  })
})
