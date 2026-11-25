import { describe, expect, it } from 'vitest'
import { candidateToDraft } from './candidates'
import type { ParsedCandidate } from './candidates'
import { expenseRow } from './inbox'
import { installmentCase, installmentInfo, isLowTotal, purchaseLabel, totalBlocker, totalHint } from './installments'
import { parseNativeDraft } from './nativeBridge'
import { myMonthCost } from './monthFigures'
import { splitOf } from './split'

const base = { id: 'd1', merchant: 'Tienda Demo', kind: 'EXPENSE', confidence: 'HIGH', fingerprint: 'f', postedAtMillis: 1_795_273_230_000, createdAtMillis: 1_795_273_231_000, status: 'PENDING', account: 'CMR Falabella', medium: 'CREDIT' }
// Contrato del teléfono: los tres campos siempre vienen, null si no hay cuotas
const A = { ...base, amountClp: 30_000, installment: null, installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000, ambiguousAmount: false }
const B = { ...base, amountClp: 10_000, installment: { n: 1, total: 3 }, installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000, ambiguousAmount: true }
const C = { ...base, amountClp: 10_000, installment: { n: 2, total: 6 }, installmentRole: 'PRIOR_CHARGE', installmentCount: 6, installmentValueClp: 10_000 }
const draft = (raw: unknown) => parseNativeDraft(raw)!

describe('casos de cuotas', () => {
  it('A: compra con total', () => {
    expect(installmentCase(draft(A))).toBe('TOTAL')
    const info = installmentInfo(draft(A))!
    expect(purchaseLabel(info, 30_000)).toBe('Compra en cuotas: 3 cuotas de $10.000 · total $30.000')
  })
  it('B: compra sin total pide el total y no deja guardar la cuota como compra', () => {
    expect(installmentCase(draft(B))).toBe('NO_TOTAL')
    const info = installmentInfo(draft(B))!
    expect(totalHint(info.value!)).toBe('El aviso solo trae la cuota de $10.000. Escribe el total de la compra.')
    expect(totalBlocker(info, 0, false)).not.toBeNull()
    expect(totalBlocker(info, 9_999, true)).toMatch(/menor que una cuota/)
    expect(totalBlocker(info, 25_000, false)).toMatch(/Confirma/)
    expect(totalBlocker(info, 25_000, true)).toBeNull()
    expect(totalBlocker(info, 30_000, false)).toBeNull()
    expect(isLowTotal(info, 25_000)).toBe(true)
    expect(isLowTotal(info, 30_000)).toBe(false)
  })
  it('C: cuota de una compra anterior', () => {
    expect(installmentCase(draft(C))).toBe('PRIOR_CHARGE')
    expect(installmentInfo(draft(C))).toBeNull()
  })
  it('sin cuotas', () => {
    expect(installmentCase(draft({ ...base, amountClp: 5_000, installment: null }))).toBe('NONE')
  })
})

describe('cifras: la compra en cuotas suma el total una sola vez', () => {
  const ME = 'u1'
  const opts = { paidBy: ME, shared: false, categories: [{ id: 'c1', name: 'Compras' }], history: [{ note: 'Tienda Demo', category_id: 'c1' }] }
  it('A: un gasto Personal por $30.000 con la nota de cuotas', () => {
    const form = candidateToDraft(draft(A) as ParsedCandidate, opts)
    const row = expenseRow('h1', 'x', form, ME)
    expect(row).toMatchObject({ amount: 30_000, shared: false, paid_by: ME, note: 'Tienda Demo (3 cuotas de $10.000)', payment_method: 'tarjeta' })
    // Yo y Hogar suben exactamente $30.000 (no 30.000 + 10.000 ni 3 × 10.000)
    const split = splitOf([{ user_id: ME } as never, { user_id: 'u2' } as never])
    expect(myMonthCost([], ME, split)).toBe(0)
    expect(myMonthCost([row], ME, split)).toBe(30_000)
    expect(row.amount).toBe(30_000)
  })
  it('B: sin total no se arma un gasto con la cuota', () => {
    const form = candidateToDraft(draft(B) as ParsedCandidate, opts)
    expect(form.amount).toBe(0)
    expect(() => expenseRow('h1', 'x', form, ME)).toThrow()
  })
})
