// Copyright (c) 2026 Dinovance
// Áreas táctiles de al menos 48 px y textos de ayuda de al menos 14 px (Fitts, legibilidad con una mano).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8')
/** Valor (px) de una propiedad en TODAS las reglas cuyo selector sea exactamente este */
function px(selector: string, prop: string): number[] {
  const out: number[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (const m of css.matchAll(re)) {
    if (!m[1]!.split(',').map((s) => s.trim()).includes(selector)) continue
    const v = new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+)px`).exec(m[2]!)
    if (v) out.push(Number(v[1]))
  }
  return out
}
const last = (a: number[]) => a[a.length - 1] ?? 0

describe('tamaños mínimos', () => {
  it('los campos de fecha y descuento de Registrar miden 48 px', () => {
    expect(last(px('.reg-meta .input', 'height'))).toBeGreaterThanOrEqual(48)
    expect(last(px('.reg-pct .input', 'height'))).toBeGreaterThanOrEqual(48)
  })
  it('.link-btn tiene alto mínimo de 48 px', () => {
    expect(last(px('.link-btn', 'min-height'))).toBeGreaterThanOrEqual(48)
  })
  it.each(['.hint', '.small-text', '.field label', '.field .label-text', '.toast-detail', '.link-btn.soft'])('el texto de ayuda %s es de 14 px o más', (sel) => {
    expect(last(px(sel, 'font-size'))).toBeGreaterThanOrEqual(14)
  })
})
