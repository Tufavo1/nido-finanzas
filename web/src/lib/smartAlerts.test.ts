import { describe, expect, it } from 'vitest'
import { isSnoozed, withoutSnoozed } from './alertState'
import { buildAlerts, compareAlerts } from './engine'
import type { Alert } from './engine'
import type { ExpRow } from './expenseAnalysis'
import { isQuietHour, pickToNotify } from './smartNotify'

const me = { user_id: 'a', display_name: 'Ana', color: 'blue', household_id: 'h', joined_at: '' }
const hh = { household: { id: 'h', name: 'Casa', invite_code: null, created_at: '' }, members: [me], me, everyone: [me] } as never
const cat = (id: string, budget = 0) => ({ id, name: id, monthly_budget: budget, position: 0, archived: false, household_id: 'h' })
const exp = (amount: number, spent_on: string, o: Record<string, unknown> = {}) => ({ id: `${amount}${spent_on}`, amount, spent_on, category_id: 'c1', paid_by: 'a', shared: false, note: null, household_id: 'h', created_by: 'a', created_at: '', recurring_id: null, ...o })
const debt = (o: Record<string, unknown> = {}) => ({ id: 'd1', household_id: 'h', name: 'Tarjeta', kind: 'tarjeta', owner_id: 'a', original_amount: 900_000, monthly_payment: 90_000, monthly_rate: 2.5, due_day: 10, archived: false, created_at: '', ...o })
const salary = (amount: number) => ({ user_id: 'a', household_id: 'h', amount, pay_day: 28, updated_at: '' })

const base = {
  categories: [cat('c1')],
  expenses: [] as ReturnType<typeof exp>[],
  prevExpenses: [] as ReturnType<typeof exp>[],
  goals: [],
  contributions: [],
  debts: [] as ReturnType<typeof debt>[],
  debtPayments: [],
  salary: null as ReturnType<typeof salary> | null,
  incomes: [],
  recurring: [],
  profiles: [],
  financeReady: true,
  financeStale: false,
  profileReady: true,
}
const month = new Date(2026, 9, 1)
const now = new Date(2026, 9, 20)
const run = (over: Record<string, unknown>, rows?: ExpRow[]) => buildAlerts(hh, { ...base, ...over } as never, month, now, { rows })
const row = (amount: number, spent_on: string, o: Partial<ExpRow> = {}): ExpRow => ({ id: `${amount}${spent_on}${Math.random()}`, amount, spent_on, category_id: 'c1', paid_by: 'a', shared: false, note: null, recurring_id: null, ...o })

describe('avisos: prioridad y acciones', () => {
  it('todos traen prioridad y un botón con la acción a hacer', () => {
    const list = run({ debts: [debt()], salary: salary(1_000_000), expenses: [exp(500_000, '2026-10-05')] })
    expect(list.length).toBeGreaterThan(0)
    for (const a of list) {
      expect(typeof a.priority).toBe('number')
      expect(a.action && a.action.length > 0).toBe(true)
    }
  })

  it('una cuota atrasada es lo primero, con su botón', () => {
    const list = run({ debts: [debt({ due_day: 10 })] })
    expect(list[0]?.id.startsWith('debt-late:')).toBe(true)
    expect(list[0]).toMatchObject({ level: 'bad', action: 'Anotar el pago', amount: 90_000 })
  })

  it('con la cuota pagada no hay atraso', () => {
    const paid = [{ id: 'p', household_id: 'h', debt_id: 'd1', amount: 90_000, paid_by: 'a', paid_on: '2026-10-05', created_at: '' }]
    expect(run({ debts: [debt()], debtPayments: paid }).some((a) => a.id.startsWith('debt-late:'))).toBe(false)
  })

  it('dentro del mismo nivel ordena por prioridad y luego por plata', () => {
    const mk = (id: string, priority: number, amount = 0): Alert => ({ id, level: 'warn', area: 'gastos', title: id, detail: '', priority, amount })
    const sorted = [mk('a', 40), mk('b', 70), mk('c', 70, 500)].sort(compareAlerts).map((x) => x.id)
    expect(sorted).toEqual(['c', 'b', 'a'])
  })
})

describe('avisos: cómo llega el mes', () => {
  it('avisa que faltaría plata a fin de mes contando lo que aún vence, y quita los avisos genéricos', () => {
    const list = run({ salary: salary(1_000_000), expenses: [exp(700_000, '2026-10-05')], recurring: [{ id: 'r1', household_id: 'h', category_id: 'c1', amount: 400_000, note: 'Arriendo', paid_by: 'a', shared: false, day_of_month: 25, starts_on: '2026-01-01', last_applied: null, active: true, created_by: 'a', created_at: '' }] })
    const short = list.find((a) => a.id.startsWith('cash-short:'))
    expect(short?.level).toBe('bad')
    expect(short?.amount).toBeGreaterThan(0)
    expect(list.some((a) => /Estás sobre|Vas a pasarte/.test(a.title))).toBe(false)
  })

  it('con holgura al final del mes sugiere qué hacer con el sobrante', () => {
    const list = run({ salary: salary(1_500_000), expenses: [exp(200_000, '2026-10-05')] })
    const s = list.find((a) => a.id.startsWith('surplus:'))
    expect(s?.level).toBe('info')
    expect(s?.action).toBe('Ver el plan')
    expect(list.some((a) => a.id.startsWith('cash-short:'))).toBe(false)
  })

  it('sin sueldo no inventa proyecciones', () => {
    expect(run({ expenses: [exp(200_000, '2026-10-05')] }).some((a) => /^(cash-|surplus)/.test(a.id))).toBe(false)
  })
})

describe('avisos: gastos', () => {
  it('detecta un posible gasto repetido', () => {
    const list = run({}, [row(25_000, '2026-10-05', { note: 'Super' }), row(25_000, '2026-10-06', { note: 'Super' })])
    expect(list.find((a) => a.id.startsWith('dup:'))).toMatchObject({ level: 'warn', action: 'Revisar el gasto' })
  })

  it('sugiere marcar como fijo lo que se repite igual cada mes', () => {
    const rows = [7, 8, 9, 10].map((m) => row(9_990, `2026-${String(m).padStart(2, '0')}-12`, { note: 'Netflix' }))
    expect(run({}, rows).find((a) => a.id.startsWith('sub:'))).toMatchObject({ action: 'Marcarlo como fijo', tab: 'money' })
  })

  it('sin historial no avisa de repetidos', () => expect(run({}).some((a) => /^(dup|sub|unusual):/.test(a.id))).toBe(false))
})

describe('avisos pospuestos', () => {
  it('un aviso pospuesto desaparece hasta que se cumple el plazo', () => {
    const t = Date.parse('2026-10-20T12:00:00')
    const snoozed = { x: t + 86_400_000 }
    expect(isSnoozed('x', snoozed, t)).toBe(true)
    expect(isSnoozed('x', snoozed, t + 2 * 86_400_000)).toBe(false)
    const list = [{ id: 'x', level: 'warn', area: 'gastos', title: '', detail: '' }, { id: 'y', level: 'warn', area: 'gastos', title: '', detail: '' }] as Alert[]
    expect(withoutSnoozed(list, snoozed, t).map((a) => a.id)).toEqual(['y'])
  })
})

describe('notificaciones inteligentes', () => {
  const mk = (id: string, level: Alert['level'], priority = 50): Alert => ({ id, level, area: 'gastos', title: id, detail: '', priority })
  const noon = new Date(2026, 9, 20, 12, 0)

  it('de noche no molesta', () => {
    expect(isQuietHour(new Date(2026, 9, 20, 23, 0))).toBe(true)
    expect(isQuietHour(new Date(2026, 9, 20, 7, 59))).toBe(true)
    expect(isQuietHour(noon)).toBe(false)
    expect(pickToNotify([mk('a', 'bad')], [], [], new Date(2026, 9, 20, 23, 0))).toEqual([])
  })

  it('manda primero lo más importante y como mucho 2 al día', () => {
    const list = [mk('w', 'warn', 40), mk('b1', 'bad', 90), mk('b2', 'bad', 70), mk('i', 'info')]
    expect(pickToNotify(list, [], [], noon).map((a) => a.id)).toEqual(['b1', 'b2'])
  })

  it('descuenta lo ya enviado hoy', () => {
    const log = [{ id: 'z', t: new Date(2026, 9, 20, 9, 0).getTime() }]
    expect(pickToNotify([mk('b1', 'bad', 90), mk('b2', 'bad', 70)], log, [], noon).map((a) => a.id)).toEqual(['b1'])
    const two = [...log, { id: 'y', t: new Date(2026, 9, 20, 10, 0).getTime() }]
    expect(pickToNotify([mk('b1', 'bad')], two, [], noon)).toEqual([])
  })

  it('un aviso de cuidado no se repite, pero uno urgente sin resolver se recuerda a los 3 días', () => {
    const day = 86_400_000
    const log = [{ id: 'w', t: noon.getTime() - 5 * day }, { id: 'b', t: noon.getTime() - 4 * day }, { id: 'b2', t: noon.getTime() - 1 * day }]
    const got = pickToNotify([mk('w', 'warn'), mk('b', 'bad'), mk('b2', 'bad')], log, [], noon).map((a) => a.id)
    expect(got).toEqual(['b'])
  })

  it('respeta lo que ya se había avisado con la versión anterior', () => {
    expect(pickToNotify([mk('a', 'warn')], [], ['a'], noon)).toEqual([])
  })
})
