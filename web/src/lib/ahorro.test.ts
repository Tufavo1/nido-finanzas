import { describe, expect, it } from 'vitest'
import { buildAnalysis } from './analysis'
import type { AnalysisInput, HistExpense } from './analysis'
import type { Debt, DebtPayment } from './data'
import { accruedBalance, analyzeSalary, debtView, installment, monthsToPayoff, myDebtShare, typicalMonth } from './finance'
import { emergencySaved, isEmergencyGoal, savedInMonth } from './goals'
import { computeMetrics } from './metrics'
import { buildNumbers } from './numbers'
import { fraction, portion, splitOf } from './split'
import { monthlyFixedTotal, pendingFixedThisMonth } from './upcoming'

const NOW = new Date(2026, 9, 20)
const OCT = new Date(2026, 9, 1)

const exp = (amount: number, spent_on: string, o: Partial<HistExpense> = {}): HistExpense => ({ amount, spent_on, category_id: 'c1', paid_by: 'a', shared: false, ...o })
const input = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({
  meId: 'a',
  memberCount: 2,
  month: OCT,
  now: NOW,
  history: [exp(200_000, '2026-10-05')],
  categories: [{ id: 'c1', name: 'Súper', monthly_budget: 0 }],
  salary: { amount: 1_000_000 },
  incomes: [],
  debts: [],
  debtPayments: [],
  contributions: [],
  goals: [{ id: 'fund', name: 'Fondo de emergencia' }],
  recurring: [],
  ...over,
})
const save = (amount: number, contributed_on = '2026-10-10', goal_id = 'fund', user_id = 'a') => ({ user_id, goal_id, amount, contributed_on })

describe('El ahorro del mes se descuenta del sueldo', () => {
  const opts = { income: 1_000_000, spent: 300_000, commitments: 0, month: OCT, now: NOW }

  it('lo que apartas baja lo que te queda', () => {
    expect(analyzeSalary(opts).free).toBe(700_000)
    const a = analyzeSalary({ ...opts, saved: 150_000 })
    expect(a.free).toBe(550_000)
    expect(a.realFree).toBe(550_000)
    expect(a.saved).toBe(150_000)
  })

  it('lo apartado cuenta como ahorro, no como plata perdida', () => {
    // 1.000.000 − gasto proyectado − 150.000 apartados: ahorra los 150.000 más lo que sobre
    const a = analyzeSalary({ ...opts, saved: 150_000 })
    const sin = analyzeSalary(opts)
    expect(a.findings[0]?.title).toBe(sin.findings[0]?.title) // mismo % de ahorro total
  })

  it('apartar más de lo que sobraba avisa distinto a gastar de más', () => {
    const a = analyzeSalary({ ...opts, spent: 800_000, saved: 400_000 })
    expect(a.free).toBe(-200_000)
    expect(a.findings[0]?.title).toBe('Tu ahorro supera lo que te sobraba')
    expect(a.level).toBe('warn')
    const gasto = analyzeSalary({ ...opts, spent: 1_200_000 })
    expect(gasto.findings[0]?.title).toBe('Estás sobre tu sueldo')
  })

  it('savedInMonth cuenta solo lo tuyo y de ese mes', () => {
    const c = [save(50_000), save(30_000, '2026-09-30'), save(90_000, '2026-10-02', 'fund', 'b')]
    expect(savedInMonth(c, 'a', '2026-10')).toBe(50_000)
  })

  it('el análisis y el flujo muestran el mismo ahorro', () => {
    const inp = input({ contributions: [save(100_000)] })
    const a = buildAnalysis(inp)
    const n = buildNumbers(inp, a)
    expect(a.saved).toBe(100_000)
    expect(n.flow?.saved).toBe(100_000)
    expect(n.flow?.free).toBe(1_000_000 - 200_000 - 100_000)
    expect(n.flow?.per100.saved).toBe(10)
    // Apartar no cambia cuánto ahorras en total: solo lo mueve de «sobra» a «ahorro»
    const sin = input()
    expect(n.flow?.savingsPct).toBe(buildNumbers(sin, buildAnalysis(sin)).flow?.savingsPct)
    expect(n.flow?.outlook).toBe((buildNumbers(sin, buildAnalysis(sin)).flow?.outlook ?? 0) - 100_000)
  })

  it('el puntaje y el flujo usan la misma proyección (con fijos)', () => {
    const recurring = [{ id: 'r', household_id: 'h', category_id: 'c1', amount: 300_000, note: 'Arriendo', paid_by: 'a', shared: false, day_of_month: 28, starts_on: '2026-01-01', last_applied: null, active: true, created_by: 'a', created_at: '' }]
    const inp = input({ recurring: recurring as never })
    const a = buildAnalysis(inp)
    const n = buildNumbers(inp, a)
    const pctScore = a.score?.parts.find((p) => p.key === 'ahorro')
    expect(pendingFixedThisMonth(recurring as never, 'a', 2, NOW)).toBe(300_000)
    expect(n.flow?.pendingFixed).toBe(300_000)
    // 200.000 gastados en 20 días + 300.000 de arriendo que aún no sale
    expect(a.projected).toBe(Math.round((200_000 / 20) * 31 + 300_000))
    expect(n.flow?.savingsPct).toBe(Math.round(((1_000_000 - a.projected!) * 100) / 1_000_000))
    expect(pctScore?.detail).toContain(`${n.flow?.savingsPct} %`)
  })
})

describe('Ahorro para imprevistos: una sola definición', () => {
  it('solo cuentan las metas de imprevistos', () => {
    expect(isEmergencyGoal('Fondo de emergencia')).toBe(true)
    expect(isEmergencyGoal('Colchón')).toBe(true)
    expect(isEmergencyGoal('Vacaciones')).toBe(false)
    const goals = [{ id: 'fund', name: 'Fondo de emergencia' }, { id: 'trip', name: 'Vacaciones' }]
    expect(emergencySaved([save(100_000), save(900_000, '2026-10-10', 'trip')], goals, 'a')).toBe(100_000)
  })

  it('ahorrar para vacaciones no mejora el colchón del puntaje ni del análisis', () => {
    const goals = [{ id: 'trip', name: 'Vacaciones' }]
    const inp = input({ goals, contributions: [save(900_000, '2026-01-15', 'trip')], history: [exp(100_000, '2026-09-05'), exp(100_000, '2026-10-03')] })
    const a = buildAnalysis(inp)
    const colchon = a.score?.parts.find((p) => p.key === 'colchon')
    expect(colchon?.points).toBe(0)
    expect(colchon?.detail).toContain('Aún no tienes')
    expect(a.insights.some((i) => i.title === 'Aún no tienes ahorro para imprevistos')).toBe(true)
    expect(buildNumbers(inp, a).cushion?.saved).toBe(0)
  })

  it('una meta de imprevistos sí suma al colchón', () => {
    const inp = input({ contributions: [save(100_000, '2026-01-15')], history: [exp(100_000, '2026-09-05'), exp(100_000, '2026-10-03')] })
    const a = buildAnalysis(inp)
    expect(a.cushionMonths).toBeCloseTo(1)
    expect(buildNumbers(inp, a).cushion?.saved).toBe(100_000)
  })
})

describe('Reparto de lo compartido', () => {
  const pair = (a: number | null, b: number | null) => [
    { user_id: 'a', share_pct: a },
    { user_id: 'b', share_pct: b },
  ]

  it('sin acuerdo es por igual', () => {
    expect(splitOf(pair(null, null))).toBe(2)
    expect(splitOf(pair(60, null))).toBe(2)
    expect(splitOf(pair(60, 60))).toBe(2) // no suman 100: se ignora
    expect(splitOf([{ user_id: 'a', share_pct: 70 }])).toBe(1)
  })

  it('con acuerdo reparte por porcentaje', () => {
    const s = splitOf(pair(60, 40))
    expect(fraction(s, 'a')).toBeCloseTo(0.6)
    expect(portion(100_000, s, 'b')).toBeCloseTo(40_000)
    expect(portion(100_000, 2, 'a')).toBe(50_000)
  })

  it('myShare, deudas y fijos respetan el reparto', () => {
    const s = splitOf(pair(70, 30))
    const a = buildAnalysis(input({ memberCount: s, history: [exp(100_000, '2026-10-05', { shared: true })] }))
    expect(a.cost).toBe(70_000)
    const debt = { id: 'd', household_id: 'h', name: 'Casa', kind: 'credito', owner_id: null, original_amount: 1_000_000, monthly_payment: 100_000, monthly_rate: 0, due_day: 5, archived: false, created_at: '' } as Debt
    expect(myDebtShare([debt], [], 'a', s)).toBe(70_000)
    expect(myDebtShare([debt], [], 'b', s)).toBe(30_000)
  })

  it('la cuenta entre ustedes cuadra con el reparto acordado', () => {
    const members = [
      { user_id: 'a', display_name: 'Ana', color: 'x', share_pct: 70 },
      { user_id: 'b', display_name: 'Beto', color: 'y', share_pct: 30 },
    ] as never
    const e = (id: string, amount: number, paid_by: string) => ({ id, amount, spent_on: '2026-10-05', category_id: 'c1', paid_by, shared: true, note: null }) as never
    const m = computeMetrics([e('1', 100_000, 'a'), e('2', 50_000, 'b')], [], [], members, OCT, NOW)
    const [pa, pb] = m.people
    expect(pa?.fairShare).toBe(105_000)
    expect(pb?.fairShare).toBe(45_000)
    expect(pa!.fairShare + pb!.fairShare).toBe(150_000)
    expect(m.settle?.amount).toBe(5_000)
    expect(m.settle?.from.userId).toBe('a') // puso 100.000 y le tocaban 105.000
  })

  it('sin acuerdo la cuenta sigue siendo mitad y mitad', () => {
    const members = [
      { user_id: 'a', display_name: 'Ana', color: 'x' },
      { user_id: 'b', display_name: 'Beto', color: 'y' },
    ] as never
    const e = { id: '1', amount: 100_001, spent_on: '2026-10-05', category_id: 'c1', paid_by: 'a', shared: true, note: null } as never
    const m = computeMetrics([e], [], [], members, OCT, NOW)
    expect(m.people.map((p) => p.fairShare)).toEqual([50_001, 50_000])
  })
})

describe('Deudas: el interés se va sumando al saldo', () => {
  const debt = (o: Partial<Debt> = {}) => ({ id: 'd', household_id: 'h', name: 'Tarjeta', kind: 'tarjeta', owner_id: 'a', original_amount: 1_000_000, monthly_payment: 100_000, monthly_rate: 2, due_day: 5, archived: false, created_at: '2026-07-10T12:00:00Z', ...o }) as Debt
  const pay = (amount: number, paid_on: string) => ({ id: paid_on, household_id: 'h', debt_id: 'd', amount, paid_by: 'a', paid_on, created_at: '' }) as DebtPayment

  it('sin pagos crece 2 % cada mes (jul → oct = 3 meses)', () => {
    const r = accruedBalance(debt(), [], NOW)
    expect(r.remaining).toBe(Math.round(1_000_000 * 1.02 ** 3))
    expect(r.accrued).toBe(r.remaining - 1_000_000)
  })

  it('los pagos bajan el saldo después de sumar el interés del mes', () => {
    // jul: 1.000.000 − 100.000 = 900.000; ago: ×1,02 − 100.000; sep: igual
    const pays = [pay(100_000, '2026-07-12'), pay(100_000, '2026-08-12'), pay(100_000, '2026-09-12')]
    let b = 900_000
    b = b * 1.02 - 100_000
    b = b * 1.02 - 100_000
    b = b * 1.02 // octubre: interés, aún sin pago
    expect(accruedBalance(debt(), pays, NOW).remaining).toBe(Math.round(b))
    expect(debtView(debt(), pays, NOW).remaining).toBeGreaterThan(1_000_000 - 300_000)
  })

  it('sin tasa o sin fecha de alta es solo lo anotado menos lo pagado', () => {
    expect(accruedBalance(debt({ monthly_rate: 0 }), [pay(100_000, '2026-08-01')], NOW)).toEqual({ remaining: 900_000, accrued: 0 })
    expect(accruedBalance(debt({ created_at: '' }), [pay(100_000, '2026-08-01')], NOW)).toEqual({ remaining: 900_000, accrued: 0 })
  })

  it('una deuda anotada este mes todavía no suma interés', () => {
    expect(accruedBalance(debt({ created_at: '2026-10-02T12:00:00Z' }), [], NOW)).toEqual({ remaining: 1_000_000, accrued: 0 })
  })

  it('pagar todo la deja en cero y no sigue creciendo', () => {
    const r = accruedBalance(debt({ created_at: '2026-08-10T12:00:00Z' }), [pay(1_500_000, '2026-08-11')], NOW)
    expect(r.remaining).toBe(0)
  })
})

describe('Cuota de un crédito', () => {
  it('sin interés es el saldo dividido en las cuotas', () => expect(installment(1_200_000, 12, 0)).toBe(100_000))
  it('con interés es más que eso y termina de pagar en ese plazo', () => {
    const cuota = installment(1_000_000, 24, 2)
    expect(cuota).toBeGreaterThan(1_000_000 / 24)
    expect(monthsToPayoff(1_000_000, cuota, 2)).toBe(24)
  })
  it('sin saldo o sin cuotas no hay cuota', () => {
    expect(installment(0, 12, 2)).toBe(0)
    expect(installment(100_000, 0, 2)).toBe(0)
  })
})

describe('Cómo es un mes completo', () => {
  const base = { income: 1_000_000, monthlyFixed: 400_000, commitments: 100_000, month: OCT, now: NOW }

  it('resta los fijos, las cuotas y lo que gastas día a día', () => {
    // 20 de 31 días: 200.000 de día a día llevan a 310.000 en el mes
    const t = typicalMonth({ ...base, spent: 200_000, fixedBooked: 0, pendingFixed: 400_000 })
    expect(t.variable).toBe(310_000)
    expect(t.left).toBe(1_000_000 - 400_000 - 100_000 - 310_000)
    expect(t.unbookedFixed).toBe(0)
  })

  it('los fijos ya anotados no se cuentan como gasto del día a día', () => {
    const t = typicalMonth({ ...base, spent: 600_000, fixedBooked: 400_000, pendingFixed: 0 })
    expect(t.variable).toBe(310_000)
    expect(t.unbookedFixed).toBe(0)
  })

  it('detecta los fijos creados después de su día, que no se anotaron ni están por venir', () => {
    const t = typicalMonth({ ...base, spent: 100_000, fixedBooked: 0, pendingFixed: 0 })
    expect(t.unbookedFixed).toBe(400_000)
  })
})

describe('Total de gastos fijos del mes', () => {
  const r = (o: Record<string, unknown>) => ({ id: 'r', household_id: 'h', category_id: 'c', amount: 100_000, note: 'x', paid_by: 'a', shared: false, day_of_month: 10, starts_on: '2026-10-26', last_applied: null, active: true, created_by: 'a', created_at: '', ...o }) as never
  it('suma mi parte de los activos aunque su día ya haya pasado', () => {
    expect(monthlyFixedTotal([r({}), r({ shared: true, amount: 200_000 }), r({ paid_by: 'b' }), r({ active: false })], 'a', 2, NOW)).toBe(200_000)
  })
  it('un fijo que empieza el mes que viene no cuenta todavía', () => {
    expect(monthlyFixedTotal([r({ starts_on: '2026-11-05' })], 'a', 2, NOW)).toBe(0)
  })
})
