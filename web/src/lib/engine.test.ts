import { describe, expect, it } from 'vitest'
import { buildAlerts } from './engine'
import { adviceFor, professionGroup } from './profile'
import { pickUnseen } from './smartNotify'

const me = { user_id: 'a', display_name: 'Ana', color: 'blue', household_id: 'h', joined_at: '' }
const hh = {
  household: { id: 'h', name: 'Casa', invite_code: null, created_at: '' },
  members: [me, { ...me, user_id: 'b', display_name: 'Beto', color: 'amber' }],
  me,
} as never

const cat = (id: string, budget: number) => ({ id, name: id, monthly_budget: budget, position: 0, archived: false, household_id: 'h' })
const exp = (amount: number, spent_on: string, category_id = 'c1', paid_by = 'a', shared = true) =>
  ({ id: `${amount}${spent_on}${category_id}`, amount, spent_on, category_id, paid_by, shared, note: null, household_id: 'h', created_by: paid_by, created_at: '' })

const base = {
  categories: [cat('c1', 100000)],
  expenses: [] as ReturnType<typeof exp>[],
  prevExpenses: [] as ReturnType<typeof exp>[],
  goals: [],
  contributions: [],
  debts: [],
  debtPayments: [],
  salary: null,
  incomes: [],
  recurring: [],
  profiles: [],
  financeReady: true,
  profileReady: true,
}
const month = new Date(2026, 9, 1)
const now = new Date(2026, 9, 20)
const run = (over: Record<string, unknown>) => buildAlerts(hh, { ...base, ...over } as never, month, now)

describe('motor de avisos', () => {
  it('avisa cuando una categoría se pasa del presupuesto', () => {
    const a = run({ expenses: [exp(120000, '2026-10-10')] })
    expect(a.find((x) => x.id.startsWith('bud-over'))?.level).toBe('bad')
  })

  it('avisa antes de pasarse (80 %)', () => {
    const a = run({ expenses: [exp(85000, '2026-10-10')] })
    expect(a.some((x) => x.id.startsWith('bud-80'))).toBe(true)
  })

  it('proyecta una categoría que terminará pasada', () => {
    const a = run({ expenses: [exp(75000, '2026-10-05')] })
    expect(a.some((x) => x.id.startsWith('bud-proj'))).toBe(true)
  })

  it('ordena lo urgente primero', () => {
    const a = run({ expenses: [exp(120000, '2026-10-10')] })
    const order = ['bad', 'warn', 'info', 'ok']
    const ranks = a.map((x) => order.indexOf(x.level))
    expect(ranks).toEqual([...ranks].sort((p, q) => p - q))
  })

  it('detecta falta de registros recientes', () => {
    const a = run({ expenses: [exp(5000, '2026-10-02')] })
    expect(a.some((x) => x.id.startsWith('idle'))).toBe(true)
  })

  it('sin sueldo pide ponerlo; con sueldo insuficiente avisa', () => {
    expect(run({}).some((x) => x.id === 'salary-missing')).toBe(true)
    const salary = { user_id: 'a', household_id: 'h', amount: 100000, pay_day: 28, updated_at: '' }
    const a = run({ salary, expenses: [exp(90000, '2026-10-10', 'c1', 'a', false)] })
    expect(a.some((x) => x.area === 'sueldo' && x.level === 'bad')).toBe(true)
  })

  it('suma los ingresos extra al sueldo', () => {
    const salary = { user_id: 'a', household_id: 'h', amount: 100000, pay_day: 28, updated_at: '' }
    const gastos = [exp(90000, '2026-10-10', 'c1', 'a', false)]
    const sinExtra = run({ salary, expenses: gastos }).filter((x) => x.area === 'sueldo' && x.level === 'bad')
    const bono = { id: 'i1', user_id: 'a', household_id: 'h', amount: 400000, source: 'Bono', received_on: '2026-10-05', created_at: '' }
    const conExtra = run({ salary, expenses: gastos, incomes: [bono] }).filter((x) => x.area === 'sueldo' && x.level === 'bad')
    expect(sinExtra.length).toBeGreaterThan(0)
    expect(conExtra.length).toBe(0)
  })

  it('sugiere fondo de emergencia según el perfil y no lo repite si existe', () => {
    const prevExpenses = [exp(500000, '2026-09-10')]
    const profiles = [{ user_id: 'a', household_id: 'h', profession: 'Diseñadora', employment: 'independiente', dependents: 0, updated_at: '' }]
    const a = run({ prevExpenses, profiles })
    expect(a.find((x) => x.id === 'fund-missing')?.detail).toContain('6 meses')
    const goals = [{ id: 'g', name: 'Fondo de emergencia', target_amount: 3000000, household_id: 'h', archived: false, target_date: null, created_at: '' }]
    expect(run({ prevExpenses, profiles, goals }).some((x) => x.id === 'fund-missing')).toBe(false)
  })

  it('avisa de metas atrasadas', () => {
    const goals = [{ id: 'g', name: 'Viaje', target_amount: 1200000, household_id: 'h', archived: false, target_date: '2026-12-20', created_at: '' }]
    const a = run({ goals })
    expect(a.some((x) => x.id.startsWith('goal-pace'))).toBe(true)
  })
})

describe('perfil', () => {
  it('reconoce profesiones aunque haya tildes o plurales', () => {
    expect(professionGroup('Enfermera')?.key).toBe('salud')
    expect(professionGroup('Programador web')?.key).toBe('tecnologia')
    expect(professionGroup('Conductor de Uber')?.key).toBe('transporte')
    expect(professionGroup('Diseñadora gráfica')?.key).toBe('creativo')
    expect(professionGroup('xx')).toBeNull()
  })

  it('el colchón crece con ingreso variable y personas a cargo', () => {
    expect(adviceFor({ profession: '', employment: 'dependiente', dependents: 0 }).emergencyMonths).toBe(3)
    expect(adviceFor({ profession: '', employment: 'independiente', dependents: 0 }).emergencyMonths).toBe(6)
    expect(adviceFor({ profession: '', employment: 'independiente', dependents: 3 }).emergencyMonths).toBe(8)
    expect(adviceFor({ profession: '', employment: 'honorarios', dependents: 0 }).tips.join(' ')).toContain('15,25')
  })
})

describe('avisos del sistema', () => {
  it('solo notifica avisos importantes y no repetidos, máximo tres', () => {
    const mk = (id: string, level: 'bad' | 'warn' | 'info') => ({ id, level, area: 'gastos' as const, title: id, detail: '' })
    const list = [mk('a', 'bad'), mk('b', 'info'), mk('c', 'warn'), mk('d', 'warn'), mk('e', 'bad')]
    expect(pickUnseen(list, ['c']).map((x) => x.id)).toEqual(['a', 'd', 'e'])
  })
})
