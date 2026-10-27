import { describe, expect, it } from 'vitest'
import type { Debt, DebtPayment, Recurring } from './data'
import { buildUpcoming } from './upcoming'
import type { UpcomingInput } from './upcoming'

const NOW = new Date(2026, 9, 20) // 20 de octubre
const rec = (o: Partial<Recurring>): Recurring =>
  ({ id: 'r1', household_id: 'h', category_id: 'c', amount: 400_000, note: 'Arriendo', paid_by: 'a', shared: false, day_of_month: 25, starts_on: '2026-01-01', last_applied: null, active: true, created_by: 'a', created_at: '', ...o }) as Recurring
const debt = (o: Partial<Debt> = {}): Debt =>
  ({ id: 'd1', household_id: 'h', name: 'Tarjeta', kind: 'tarjeta', owner_id: 'a', original_amount: 1_000_000, monthly_payment: 100_000, monthly_rate: 2, due_day: 28, archived: false, created_at: '', ...o }) as Debt
const base = (o: Partial<UpcomingInput> = {}): UpcomingInput => ({
  now: NOW,
  meId: 'a',
  split: 2,
  recurring: [],
  debts: [],
  debtPayments: [],
  salary: null,
  free: null,
  variableDaily: 0,
  ...o,
})

describe('Gastos fijos que vienen', () => {
  it('lista el que cae más adelante este mes', () => {
    const u = buildUpcoming(base({ recurring: [rec({})] }))
    expect(u.events[0]).toMatchObject({ kind: 'fijo', name: 'Arriendo', amount: 400_000, inDays: 5 })
  })

  it('si ya se anotó este mes, el próximo es el del mes que viene', () => {
    const u = buildUpcoming(base({ recurring: [rec({ last_applied: '2026-10-08', day_of_month: 8 })] }))
    expect(u.events[0]?.date.getMonth()).toBe(10) // noviembre
    expect(u.outThisMonth).toBe(0)
  })

  it('un gasto compartido cuenta solo tu mitad', () => {
    expect(buildUpcoming(base({ recurring: [rec({ shared: true })] })).events[0]?.amount).toBe(200_000)
  })

  it('un gasto de otra persona no es tuyo', () => {
    expect(buildUpcoming(base({ recurring: [rec({ paid_by: 'b', shared: false })] })).events).toHaveLength(0)
  })

  it('un gasto fijo pausado no aparece', () => expect(buildUpcoming(base({ recurring: [rec({ active: false })] })).events).toHaveLength(0))
})

describe('Cuotas de deudas', () => {
  it('aparece con su vencimiento', () => {
    const u = buildUpcoming(base({ debts: [debt()] }))
    expect(u.events[0]).toMatchObject({ kind: 'deuda', amount: 100_000, inDays: 8, late: false })
  })

  it('una cuota vencida sin pagar queda como atrasada y para hoy', () => {
    const u = buildUpcoming(base({ debts: [debt({ due_day: 10 })] }))
    expect(u.events[0]).toMatchObject({ late: true, inDays: 0, amount: 100_000 })
  })

  const paid = [{ id: 'p', household_id: 'h', debt_id: 'd1', amount: 100_000, paid_by: 'a', paid_on: '2026-10-05', created_at: '' }] as DebtPayment[]

  it('si ya la pagaste este mes y la próxima queda a más de 30 días, no aparece', () => {
    expect(buildUpcoming(base({ debts: [debt({ due_day: 28 })], debtPayments: paid })).events).toHaveLength(0)
  })

  it('si ya la pagaste y la próxima cae dentro de 30 días, es la del mes que viene', () => {
    const u = buildUpcoming(base({ debts: [debt({ due_day: 10 })], debtPayments: paid }))
    expect(u.events[0]?.date.getMonth()).toBe(10)
    expect(u.events[0]?.late).toBe(false)
  })

  it('una deuda compartida cuenta tu mitad', () => {
    expect(buildUpcoming(base({ debts: [debt({ owner_id: null })] })).events[0]?.amount).toBe(50_000)
  })

  it('la deuda de otra persona no aparece', () => expect(buildUpcoming(base({ debts: [debt({ owner_id: 'b' })] })).events).toHaveLength(0))
})

describe('Sueldo y resumen', () => {
  it('muestra el próximo depósito', () => {
    const u = buildUpcoming(base({ salary: { amount: 1_500_000, pay_day: 30 } }))
    expect(u.nextIncome).toMatchObject({ kind: 'sueldo', amount: 1_500_000, inDays: 10 })
  })

  it('suma lo que sale y encuentra el día más pesado', () => {
    const u = buildUpcoming(base({ recurring: [rec({ day_of_month: 28 })], debts: [debt({ due_day: 28 })] }))
    expect(u.out30).toBe(500_000)
    expect(u.heaviest?.total).toBe(500_000)
    expect(u.heaviest?.names).toHaveLength(2)
  })

  it('a fin de mes: lo que sobra menos fijos pendientes y el gasto diario por los días que quedan', () => {
    // quedan 11 días (21..31): 300.000 - 400.000 - 5.000*11
    const u = buildUpcoming(base({ recurring: [rec({})], free: 300_000, variableDaily: 5_000 }))
    expect(u.endOfMonth).toBe(300_000 - 400_000 - 55_000)
  })

  it('las cuotas de deuda no se restan dos veces', () => {
    const u = buildUpcoming(base({ debts: [debt()], free: 500_000, variableDaily: 0 }))
    expect(u.endOfMonth).toBe(500_000)
  })

  it('sin sueldo no hay proyección de fin de mes', () => expect(buildUpcoming(base({ recurring: [rec({})] })).endOfMonth).toBeNull())
})
