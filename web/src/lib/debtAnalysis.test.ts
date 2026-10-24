import { describe, expect, it } from 'vitest'
import type { Debt, DebtPayment } from './data'
import { analyzeDebts } from './debtAnalysis'

const NOW = new Date(2026, 9, 20) // 20 de octubre
const debt = (id: string, name: string, original: number, payment: number, rate: number, due: number | null = null): Debt =>
  ({ id, household_id: 'h', name, kind: 'tarjeta', owner_id: null, original_amount: original, monthly_payment: payment, monthly_rate: rate, due_day: due, archived: false, created_at: '2026-01-01' }) as Debt
const pay = (debt_id: string, amount: number, paid_on: string): DebtPayment =>
  ({ id: `${debt_id}${paid_on}${amount}`, household_id: 'h', debt_id, amount, paid_by: 'a', paid_on, created_at: paid_on }) as DebtPayment

const CARD = debt('t', 'Tarjeta', 1_000_000, 60_000, 3)
const LOAN = debt('c', 'Crédito', 3_000_000, 150_000, 1)

describe('Estrategia de pago', () => {
  it('sin deudas no hay plan', () => expect(analyzeDebts([], [], NOW).plan).toBeNull())

  it('pasar la cuota liberada a la deuda más cara ahorra interés frente a seguir como hoy', () => {
    const p = analyzeDebts([CARD, LOAN], [], NOW).plan
    expect(p?.order).toEqual(['Tarjeta', 'Crédito'])
    expect(p?.avalanche?.interest).toBeLessThan(p?.current?.interest ?? 0)
    expect(p?.interestSaved).toBeGreaterThan(0)
    expect(p?.avalanche?.months).toBeLessThanOrEqual(p?.current?.months ?? 0)
  })

  it('la avalancha nunca paga más interés que la bola de nieve', () => {
    const p = analyzeDebts([CARD, LOAN], [], NOW).plan
    expect(p?.avalanche?.interest).toBeLessThanOrEqual(p?.snowball?.interest ?? 0)
  })

  it('con una sola deuda no hay diferencia entre estrategias', () => {
    const p = analyzeDebts([CARD], [], NOW).plan
    expect(p?.interestSaved).toBe(0)
    expect(p?.best).toBe('same')
  })

  it('una cuota que no cubre el interés no termina nunca', () => {
    const r = analyzeDebts([debt('x', 'Mala', 1_000_000, 10_000, 5)], [], NOW)
    expect(r.plan?.current).toBeNull()
    expect(r.costs[0]?.totalInterest).toBeNull()
    expect(r.findings.some((f) => f.level === 'bad' && f.title.includes('no va a bajar'))).toBe(true)
  })

  it('sin cuotas definidas no hay plan', () => expect(analyzeDebts([debt('x', 'Sin cuota', 500_000, 0, 1)], [], NOW).plan).toBeNull())
})

describe('Pago extra', () => {
  it('más extra termina antes y ahorra más interés', () => {
    const e = analyzeDebts([CARD, LOAN], [], NOW).extras
    expect(e).toHaveLength(3)
    expect(e[2]!.months).toBeLessThan(e[0]!.months)
    expect(e[2]!.interestSaved).toBeGreaterThan(e[0]!.interestSaved)
  })
})

describe('Pagos al día', () => {
  const due10 = debt('t', 'Tarjeta', 1_000_000, 60_000, 3, 10)

  it('marca atrasada la cuota cuyo vencimiento ya pasó sin pagarse', () => {
    const r = analyzeDebts([due10], [], NOW)
    expect(r.payments.due[0]?.late).toBe(true)
    expect(r.findings[0]?.title).toContain('atrasada')
  })

  it('con la cuota pagada no hay atraso', () => {
    const r = analyzeDebts([due10], [pay('t', 60_000, '2026-10-10')], NOW)
    expect(r.payments.due[0]?.late).toBe(false)
    expect(r.payments.due[0]?.paid).toBe(true)
    expect(r.payments.compliancePct).toBe(100)
  })

  it('cumplimiento parcial', () => {
    const r = analyzeDebts([due10], [pay('t', 30_000, '2026-10-10')], NOW)
    expect(r.payments.compliancePct).toBe(50)
    expect(r.payments.due[0]?.pending).toBe(30_000)
  })

  it('cuenta los meses seguidos con pagos', () => {
    const ps = [pay('t', 60_000, '2026-10-02'), pay('t', 60_000, '2026-09-10'), pay('t', 60_000, '2026-08-10'), pay('t', 60_000, '2026-06-10')]
    expect(analyzeDebts([due10], ps, NOW).payments.streak).toBe(3) // oct, sep, ago; julio cortó la racha
  })

  it('totales e historial por mes', () => {
    const r = analyzeDebts([CARD], [pay('t', 60_000, '2026-10-02'), pay('t', 40_000, '2026-09-10')], NOW).payments
    expect(r.total).toBe(100_000)
    expect(r.count).toBe(2)
    expect(r.byMonth.at(-1)?.amount).toBe(60_000)
    expect(r.byMonth.at(-2)?.amount).toBe(40_000)
    expect(r.lastPaidDays).toBe(18)
  })
})
