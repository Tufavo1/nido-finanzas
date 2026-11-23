import { describe, expect, it } from 'vitest'
import { createLinkGuard, linkToDraft } from './linkGuard'

const NOW = new Date(2026, 10, 21, 12, 0, 0)
const URL1 = 'nido://gasto?monto=5990&comercio=Cafe%20Demo'

describe('createLinkGuard: un enlace abre un solo borrador', () => {
  it('el mismo enlace repetido en pocos segundos se ignora', () => {
    const g = createLinkGuard()
    expect(g.accept(URL1, 1_000)).toBe(true)
    expect(g.accept(URL1, 1_500)).toBe(false)
  })
  it('pasada la ventana, el mismo enlace vuelve a valer (otra compra igual)', () => {
    const g = createLinkGuard()
    g.accept(URL1, 1_000)
    expect(g.accept(URL1, 1_000 + 30_000)).toBe(true)
  })
  it('un enlace distinto siempre vale', () => {
    const g = createLinkGuard()
    g.accept(URL1, 1_000)
    expect(g.accept('nido://gasto?monto=100', 1_100)).toBe(true)
  })
})

describe('linkToDraft', () => {
  it('un enlace válido da un borrador con monto, comercio y la fecha de hoy', () => {
    const r = linkToDraft(URL1, NOW)
    expect(r).toEqual({ ok: true, candidate: expect.objectContaining({ amountClp: 5990, merchant: 'Cafe Demo', kind: 'EXPENSE', installment: null }) })
    if (r.ok) expect(new Date(r.candidate.postedAtMillis).getDate()).toBe(21)
  })
  it('usa la fecha del enlace si viene', () => {
    const r = linkToDraft('nido://gasto?monto=100&fecha=2026-11-10', NOW)
    expect(r.ok && new Date(r.candidate.postedAtMillis).getDate()).toBe(10)
  })
  it('un enlace inválido se rechaza con un motivo', () => {
    expect(linkToDraft('nido://gasto?monto=abc', NOW)).toEqual({ ok: false, reason: expect.any(String) })
    expect(linkToDraft('https://otro.sitio', NOW).ok).toBe(false)
  })
})
