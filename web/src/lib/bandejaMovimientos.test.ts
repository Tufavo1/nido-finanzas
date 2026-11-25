// Copyright (c) 2026 Dinovance
// Bandeja: a dónde va cada aviso y cómo cuenta en el mes. Datos SINTÉTICOS.
import { describe, expect, it } from 'vitest'
import { analyzeSalary, debtView, monthIncome, myDebtShare } from './finance'
import { debtPaymentRow, incomeRow, INCOME_SOURCE, movementExpenseDraft, newDebtRow, saveMovement } from './movements'
import { debtPayImpact, monthLeftAfter } from './monthLeft'
import { matchDebt, preselectDebt } from './debtMatch'
import { parseNativeDraft } from './nativeBridge'
import type { NativeDraft } from './nativeBridge'
import type { Tables } from './database.types'

const ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const mk = (o: Partial<NativeDraft> = {}): NativeDraft => ({ id: ID, amountClp: 34_400, merchant: null, kind: 'DEBT_PAYMENT', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: Date.UTC(2026, 10, 10, 15), createdAtMillis: 1, status: 'PENDING', ...o })
const NOW = new Date(2026, 10, 15)
const debt = (o: Partial<Tables<'debts'>> = {}): Tables<'debts'> => ({ id: 'd1', household_id: 'h', name: 'CMR', kind: 'tarjeta', owner_id: 'me', original_amount: 300_000, monthly_payment: 0, monthly_rate: 0, due_day: null, archived: false, created_at: '2026-10-01T00:00:00Z', ...o })
const pay = (o: Partial<Tables<'debt_payments'>> = {}): Tables<'debt_payments'> => ({ id: 'p1', household_id: 'h', debt_id: 'd1', amount: 34_400, paid_by: 'me', paid_on: '2026-11-10', created_at: '2026-11-10T00:00:00Z', ...o }) as Tables<'debt_payments'>

describe('tipos nuevos', () => {
  it('acepta TRANSFER_OUT con destinatario en merchant', () => {
    const r = parseNativeDraft({ id: 'a', amountClp: 20_000, merchant: 'Juan Perez', kind: 'TRANSFER_OUT', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: 1, createdAtMillis: 1, status: 'PENDING' })
    expect(r).toMatchObject({ kind: 'TRANSFER_OUT', merchant: 'Juan Perez' })
  })
  it('el ingreso se guarda con el rótulo «Ingreso extra»', () => {
    expect(INCOME_SOURCE).toBe('Ingreso extra')
    expect(incomeRow('h', mk({ kind: 'INCOME' })).source).toBe('Ingreso extra')
  })
  it('saveMovement acepta transferencia solo si se lo permiten y nunca guarda sola', async () => {
    const order: string[] = []
    await saveMovement(mk({ kind: 'TRANSFER_OUT' }), ['DEBT_PAYMENT', 'TRANSFER_OUT'], { insert: async () => (order.push('i'), true), removeDraft: async () => void order.push('r') })
    expect(order).toEqual(['i', 'r'])
    await expect(saveMovement(mk({ kind: 'INCOME' }), ['DEBT_PAYMENT', 'TRANSFER_OUT'], { insert: async () => true, removeDraft: async () => undefined })).rejects.toThrow()
  })
  it('si falla el guardado el borrador queda', async () => {
    let removed = false
    await expect(saveMovement(mk({ kind: 'TRANSFER_OUT' }), 'TRANSFER_OUT', { insert: async () => false, removeDraft: async () => void (removed = true) })).rejects.toThrow()
    expect(removed).toBe(false)
  })
})

describe('deuda nueva y gasto desde el aviso', () => {
  it('la deuda nueva lleva nombre, saldo y un id estable por borrador', () => {
    const a = newDebtRow('h', mk(), 'CMR Mastercard', 250_000)
    expect(a).toMatchObject({ household_id: 'h', name: 'CMR Mastercard', original_amount: 250_000, monthly_payment: 0, monthly_rate: 0, kind: 'tarjeta' })
    expect(a.id).toBe(newDebtRow('h', mk(), 'otro', 1).id)
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('el nombre se limpia y se acota a 60', () => {
    expect(newDebtRow('h', mk(), `  ${'x'.repeat(80)} `, 1).name).toHaveLength(60)
  })
  it('solo es un gasto: usa la fecha del aviso (Santiago), el destinatario y la categoría elegida', () => {
    const o = { paidBy: 'me', shared: false, categories: [], history: [] }
    const e = movementExpenseDraft(mk({ kind: 'TRANSFER_OUT', merchant: 'Juan Perez', amountClp: 20_000 }), o, 'cat1')
    expect(e).toMatchObject({ amount: 20_000, category_id: 'cat1', note: 'Transferencia a Juan Perez', spent_on: '2026-11-10', paid_by: 'me', shared: false })
    expect(movementExpenseDraft(mk({ account: 'CMR Mastercard' }), o, 'c').note).toBe('Pago CMR Mastercard')
  })
})

describe('deuda preseleccionada', () => {
  const debts = [{ id: 'd1', name: 'CMR Premium' }, { id: 'd2', name: 'Auto' }]
  it('con coincidencia clara se preselecciona', () => {
    expect(preselectDebt(matchDebt('CMR Mastercard Premium ·5766', debts))).toBe('d1')
  })
  it('sin coincidencia clara no se preselecciona nada', () => {
    expect(preselectDebt(matchDebt('Banco Raro', debts))).toBeNull()
    expect(preselectDebt(matchDebt(null, debts))).toBeNull()
    expect(preselectDebt(matchDebt('CMR', []))).toBeNull()
  })
})

describe('el mes: sueldo + ingresos extra - gastos - pagos de deuda', () => {
  const salary = { amount: 1_000_000 }
  const base = (extra: { amount: number }[], spent: number, commitments: number) => analyzeSalary({ income: monthIncome(salary, extra), spent, commitments, month: NOW, now: NOW }).free
  it('un ingreso extra guardado desde la bandeja suma', () => {
    const row = incomeRow('h', mk({ kind: 'INCOME', amountClp: 90_000 }))
    expect(base([row], 0, 0) - base([], 0, 0)).toBe(90_000)
  })
  it('un gasto resta', () => {
    expect(base([], 0, 0) - base([], 34_400, 0)).toBe(34_400)
  })
  it('un pago de deuda baja el saldo de la deuda', () => {
    const d = debt({ monthly_payment: 65_000 })
    const before = debtView(d, [], NOW).remaining
    const after = debtView(d, [pay()], NOW).remaining
    expect(before - after).toBe(34_400)
  })
  it('pagar la cuota normal no se cuenta dos veces: el mes queda igual', () => {
    const d = debt({ monthly_payment: 65_000 })
    expect(myDebtShare([d], [], 'me', 1, NOW, [])).toBe(65_000)
    expect(myDebtShare([d], [pay({ amount: 65_000 })], 'me', 1, NOW, [])).toBe(65_000)
  })
  it('una deuda sin cuota (creada desde la bandeja) igual resta lo que se pagó este mes', () => {
    const d = debt({ monthly_payment: 0 })
    expect(myDebtShare([d], [], 'me', 1, NOW, [])).toBe(0)
    const c = myDebtShare([d], [pay()], 'me', 1, NOW, [])
    expect(c).toBe(34_400)
    expect(base([], 0, 0) - base([], 0, c)).toBe(34_400)
  })
  it('pagar más que la cuota resta el total pagado', () => {
    expect(myDebtShare([debt({ monthly_payment: 20_000 })], [pay({ amount: 50_000 })], 'me', 1, NOW, [])).toBe(50_000)
  })
  it('una deuda saldada este mes igual cuenta lo pagado; la saldada antes no', () => {
    const d = debt({ original_amount: 34_400 })
    expect(myDebtShare([d], [pay()], 'me', 1, NOW, [])).toBe(34_400)
    expect(myDebtShare([d], [pay({ paid_on: '2026-10-20' })], 'me', 1, NOW, [])).toBe(0)
  })
  it('el pago de otro mes no cuenta en este', () => {
    expect(myDebtShare([debt()], [pay({ paid_on: '2026-10-05' })], 'me', 1, NOW, [])).toBe(0)
  })
  it('la fila del pago no inventa columnas', () => {
    expect(Object.keys(debtPaymentRow('h', mk(), 'd1', 'me')).sort()).toEqual(['amount', 'debt_id', 'household_id', 'id', 'paid_by', 'paid_on'])
  })
})

describe('cuánto queda del mes', () => {
  it('sin dato de sueldo no hay línea', () => {
    expect(monthLeftAfter(null, 'income', 5_000)).toBeNull()
    expect(monthLeftAfter(Number.NaN, 'expense', 5_000)).toBeNull()
  })
  it('ingreso suma, gasto resta, pago a deuda existente no cambia (la cuota ya cuenta)', () => {
    expect(monthLeftAfter(100_000, 'income', 30_000)).toBe(130_000)
    expect(monthLeftAfter(100_000, 'expense', 30_000)).toBe(70_000)
    expect(monthLeftAfter(100_000, 'debt', 30_000, 0)).toBe(100_000)
    expect(monthLeftAfter(100_000, 'debt', 30_000, 12_000)).toBe(88_000)
  })
  it('el efecto de un pago sale de comparar las cuotas del mes antes y después', () => {
    const d = debt({ monthly_payment: 65_000 })
    expect(debtPayImpact([d], [], 'd1', 34_400, 'me', 1, [], NOW)).toBe(0)
    expect(debtPayImpact([d], [], 'd1', 90_000, 'me', 1, [], NOW)).toBe(25_000)
    expect(debtPayImpact([debt({ monthly_payment: 0 })], [], 'd1', 34_400, 'me', 1, [], NOW)).toBe(34_400)
    expect(debtPayImpact([d], [], 'zzz', 34_400, 'me', 1, [], NOW)).toBe(0)
  })
  it('pago a una deuda nueva resta lo pagado (no tiene cuota anotada)', () => {
    expect(monthLeftAfter(100_000, 'newdebt', 30_000)).toBe(70_000)
  })
})

import { ConvertError, canConvertToDebt, convertExpenseToDebtPayment, paymentFromExpense, paymentIdOfExpense, undoExpenseToDebt } from './expenseToDebt'
import { pickDefaultCategory } from './autoCategory'
import { buildAutoProfile } from './autoSync'
import { parseAutoSaved } from './nativeBridge'
import { readFileSync } from 'node:fs'

describe('historial: «Fue pago de una deuda»', () => {
  const log: string[] = []
  const deps = (o: Partial<Parameters<typeof convertExpenseToDebtPayment>[0]> = {}) => {
    log.length = 0
    return { insertPayment: async () => (log.push('pago'), true), deleteExpense: async () => void log.push('borra'), deletePayment: async () => void log.push('retira'), ...o }
  }
  const exp = { id: 'e1', amount: 34_400, spent_on: '2026-11-10', paid_by: 'me', shared: false }
  it('inserta el pago y recién después borra el gasto', async () => {
    await convertExpenseToDebtPayment(deps())
    expect(log).toEqual(['pago', 'borra'])
  })
  it('deuda nueva: primero la deuda, luego pago, luego borrar', async () => {
    await convertExpenseToDebtPayment(deps({ createDebt: async () => (log.push('deuda'), true) }))
    expect(log).toEqual(['deuda', 'pago', 'borra'])
  })
  it('si el pago falla no se borra el gasto', async () => {
    const d = deps({ insertPayment: async () => false })
    await expect(convertExpenseToDebtPayment(d)).rejects.toMatchObject({ stage: 'payment' })
    expect(log).toEqual([])
    const t = deps({ insertPayment: async () => { throw new Error('red') } })
    await expect(convertExpenseToDebtPayment(t)).rejects.toBeInstanceOf(ConvertError)
  })
  it('si falla crear la deuda no hay pago ni borrado', async () => {
    await expect(convertExpenseToDebtPayment(deps({ createDebt: async () => false }))).rejects.toMatchObject({ stage: 'debt' })
    expect(log).toEqual([])
  })
  it('si el borrado falla se retira el pago (sin doble conteo)', async () => {
    await expect(convertExpenseToDebtPayment(deps({ deleteExpense: async () => { throw new Error('rls') } }))).rejects.toMatchObject({ stage: 'delete' })
    expect(log).toEqual(['pago', 'retira'])
  })
  it('si además no se puede retirar el pago se avisa como «compensate»', async () => {
    await expect(convertExpenseToDebtPayment(deps({ deleteExpense: async () => { throw new Error('x') }, deletePayment: async () => { throw new Error('y') } }))).rejects.toMatchObject({ stage: 'compensate' })
  })
  it('deshacer: primero vuelve el gasto, luego se quita el pago; si no vuelve, el pago queda', async () => {
    const order: string[] = []
    await undoExpenseToDebt({ reinsertExpense: async () => (order.push('gasto'), true), deletePayment: async () => void order.push('quita') })
    expect(order).toEqual(['gasto', 'quita'])
    const o2: string[] = []
    await expect(undoExpenseToDebt({ reinsertExpense: async () => false, deletePayment: async () => void o2.push('quita') })).rejects.toThrow()
    expect(o2).toEqual([])
  })
  it('id del pago estable, fecha y monto del gasto; solo gastos propios y personales', () => {
    const p = paymentFromExpense('h', exp, 'd1', 'me')
    expect(p).toEqual({ id: paymentIdOfExpense('e1'), household_id: 'h', debt_id: 'd1', amount: 34_400, paid_by: 'me', paid_on: '2026-11-10' })
    expect(paymentIdOfExpense('e1')).toBe(paymentIdOfExpense('e1'))
    expect(paymentIdOfExpense('e1')).not.toBe(paymentIdOfExpense('e2'))
    expect(canConvertToDebt(exp, 'me')).toBe(true)
    expect(canConvertToDebt({ ...exp, shared: true }, 'me')).toBe(false)
    expect(canConvertToDebt({ ...exp, paid_by: 'otro' }, 'me')).toBe(false)
  })
})

describe('compras que se guardan solas: categoría general', () => {
  const cats = [{ id: 'a', name: 'Comida' }, { id: 'b', name: 'Otros' }, { id: 'c', name: 'Casa' }]
  it('prefiere «Otros» o «Sin categoría»; si no, la primera; sin categorías, null', () => {
    expect(pickDefaultCategory(cats)).toBe('b')
    expect(pickDefaultCategory([{ id: 'x', name: 'Sin categoría' }, { id: 'y', name: 'Otros' }])).toBe('y')
    expect(pickDefaultCategory([{ id: 'x', name: 'SIN CATEGORÍA' }, { id: 'a', name: 'Comida' }])).toBe('x')
    expect(pickDefaultCategory([{ id: 'a', name: 'Comida' }, { id: 'c', name: 'Casa' }])).toBe('a')
    expect(pickDefaultCategory([])).toBeNull()
  })
  it('el perfil lleva defaultCategoryId, y se omite sin categorías', () => {
    const i = { userId: 'u', householdId: 'h', shared: false, categories: cats, history: [] }
    expect(buildAutoProfile(i).defaultCategoryId).toBe('b')
    expect('defaultCategoryId' in buildAutoProfile({ ...i, categories: [] })).toBe(false)
  })
})

describe('ingreso guardado solo', () => {
  const ok = { id: 'i1', amount: 5000, note: '', at: 1, synced: true }
  it('se reconoce kind income y tolera el campo ausente', () => {
    expect(parseAutoSaved({ items: [{ ...ok, kind: 'income' }] })[0]?.kind).toBe('income')
    expect(parseAutoSaved({ items: [ok] })[0]?.kind).toBe('expense')
  })
})

describe('Inicio cuenta el sueldo más los ingresos extra', () => {
  it('Home calcula el ingreso con monthIncome y no solo con el sueldo', () => {
    const src = readFileSync(new URL('../screens/Home.tsx', import.meta.url), 'utf8')
    expect(src).toContain('income: monthIncome(data.salary, data.incomes)')
    expect(src).not.toContain('income: data.salary.amount')
  })
})
