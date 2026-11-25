// Cupo total de la tarjeta (debts.credit_limit): informativo. «Falta pagar» sigue siendo el cupo UTILIZADO.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Debt } from './data'
import { cardLimitStatus, creditLimitInput, creditLimitPatch, creditLimitProblem, isInvalidCreditLimit, isMissingCreditLimitColumn, saveDebtKeepingData, summarizeDebts } from './finance'
import { smartAlerts } from './smartAlerts'

const debt = (o: Partial<Debt> = {}): Debt =>
  ({ id: 'd1', household_id: 'h', name: 'CMR · Tarjeta de crédito', kind: 'tarjeta', owner_id: null, original_amount: 1_056_339, monthly_payment: 0, monthly_rate: 2, due_day: null, archived: false, created_at: '2026-11-01T00:00:00Z', reported_balance: 1_056_339, reported_at: '2026-11-23', ...o }) as Debt

describe('cardLimitStatus', () => {
  it('bajo el cupo: cuánto queda y el porcentaje usado', () => {
    expect(cardLimitStatus(debt({ credit_limit: 960_000 }), 600_000)).toEqual({ limit: 960_000, used: 600_000, free: 360_000, over: 0, pct: 63 })
  })
  it('justo en el cupo: queda 0 y no se pasa', () => {
    expect(cardLimitStatus(debt({ credit_limit: 960_000 }), 960_000)).toMatchObject({ free: 0, over: 0, pct: 100 })
  })
  it('caso real: usado 1.056.339 con cupo 960.000 se pasa por 96.339', () => {
    expect(cardLimitStatus(debt({ credit_limit: 960_000 }), 1_056_339)).toMatchObject({ limit: 960_000, used: 1_056_339, free: 0, over: 96_339 })
  })
  it('sin cupo o con cupo 0: null', () => {
    expect(cardLimitStatus(debt(), 1000)).toBeNull()
    expect(cardLimitStatus(debt({ credit_limit: null }), 1000)).toBeNull()
    expect(cardLimitStatus(debt({ credit_limit: 0 }), 1000)).toBeNull()
  })
  it('no es tarjeta: null', () => {
    expect(cardLimitStatus(debt({ kind: 'credito', credit_limit: 500_000 }), 1000)).toBeNull()
  })
})

describe('creditLimitPatch: la clave solo viaja si hace falta', () => {
  it('alta: vacío no manda la clave; con valor sí', () => {
    expect(creditLimitPatch('', undefined)).toEqual({})
    expect(creditLimitPatch('960000', undefined)).toEqual({ credit_limit: 960_000 })
  })
  it('edición: sin cambio no manda; cambio sí; vaciar con cupo previo manda null', () => {
    expect(creditLimitPatch('960000', debt({ credit_limit: 960_000 }))).toEqual({})
    expect(creditLimitPatch('1000000', debt({ credit_limit: 960_000 }))).toEqual({ credit_limit: 1_000_000 })
    expect(creditLimitPatch('', debt({ credit_limit: 960_000 }))).toEqual({ credit_limit: null })
    expect(creditLimitPatch('', debt())).toEqual({})
  })
})

describe('error de columna desconocida y reintento', () => {
  it('detecta PGRST204, 42703 y el nombre de la columna', () => {
    expect(isMissingCreditLimitColumn({ code: 'PGRST204', message: "Could not find the 'credit_limit' column" })).toBe(true)
    expect(isMissingCreditLimitColumn({ code: '42703', message: 'column "credit_limit" does not exist' })).toBe(true)
    expect(isMissingCreditLimitColumn({ code: '23514', message: 'otra cosa' })).toBe(false)
    expect(isMissingCreditLimitColumn(null)).toBe(false)
  })
  it('reintenta una vez sin la clave y avisa; no pierde la deuda', async () => {
    const calls: Record<string, unknown>[] = []
    const run = (f: Record<string, unknown>) => {
      calls.push(f)
      return Promise.resolve({ error: 'credit_limit' in f ? { code: 'PGRST204', message: 'credit_limit' } : null })
    }
    const r = await saveDebtKeepingData(run, { name: 'x', credit_limit: 960_000 })
    expect(calls).toEqual([{ name: 'x', credit_limit: 960_000 }, { name: 'x' }])
    expect(r).toEqual({ error: null, droppedLimit: true })
  })
  it('sin error no reintenta; otro error no reintenta', async () => {
    let n = 0
    const ok = await saveDebtKeepingData(() => (n++, Promise.resolve({ error: null })), { credit_limit: 1 })
    expect(ok).toEqual({ error: null, droppedLimit: false })
    n = 0
    const bad = await saveDebtKeepingData(() => (n++, Promise.resolve({ error: { code: '08006', message: 'red' } })), { credit_limit: 1 })
    expect(n).toBe(1)
    expect(bad.error).not.toBeNull()
  })
})

describe('M-4: solo se reintenta sin cupo si falta la columna', () => {
  const only = (err: { code?: string; message?: string }) => {
    let n = 0
    return { calls: () => n, run: () => (n++, Promise.resolve({ error: err })) }
  }
  it('reintenta con PGRST204 y 42703', () => {
    expect(isMissingCreditLimitColumn({ code: 'PGRST204', message: 'x' })).toBe(true)
    expect(isMissingCreditLimitColumn({ code: '42703', message: 'x' })).toBe(true)
  })
  it('42501 solo si el mensaje habla de la columna', () => {
    expect(isMissingCreditLimitColumn({ code: '42501', message: 'permission denied for column credit_limit of relation debts' })).toBe(true)
    expect(isMissingCreditLimitColumn({ code: '42501', message: 'permission denied for table debts' })).toBe(false)
  })
  it('un mensaje con credit_limit sin código de columna no reintenta', () => {
    expect(isMissingCreditLimitColumn({ code: '23514', message: 'violates check constraint "debts_credit_limit_rango"' })).toBe(false)
    expect(isMissingCreditLimitColumn({ message: 'algo de credit_limit' })).toBe(false)
  })
  it('23514 no reintenta ni guarda sin cupo: devuelve el error', async () => {
    const o = only({ code: '23514', message: 'violates check constraint "debts_credit_limit_rango"' })
    const r = await saveDebtKeepingData(o.run, { name: 'x', credit_limit: 9_999_999_999_999 })
    expect(o.calls()).toBe(1)
    expect(r.droppedLimit).toBe(false)
    expect(isInvalidCreditLimit(r.error)).toBe(true)
  })
  it('42501 de tabla no reintenta', async () => {
    const o = only({ code: '42501', message: 'permission denied for table debts' })
    const r = await saveDebtKeepingData(o.run, { credit_limit: 1 })
    expect(o.calls()).toBe(1)
    expect(r.error).not.toBeNull()
  })
  it('isInvalidCreditLimit solo reconoce el check del cupo', () => {
    expect(isInvalidCreditLimit({ code: '23514', message: 'debts_credit_limit_rango' })).toBe(true)
    expect(isInvalidCreditLimit({ code: '23514', message: 'otra_restriccion' })).toBe(false)
    expect(isInvalidCreditLimit(null)).toBe(false)
  })
})

describe('M-4: el cupo tiene como máximo 10 dígitos', () => {
  it('10 dígitos pasan; 11 se avisan en español', () => {
    expect(creditLimitProblem('9999999999')).toBeNull()
    expect(creditLimitProblem('99.999.999.999')).toBe('El cupo no es válido. Escribe hasta 10 dígitos.')
    expect(creditLimitProblem('')).toBeNull()
  })
  it('creditLimitPatch no manda un cupo de más de 10 dígitos', () => {
    expect(creditLimitPatch('9999999999')).toEqual({ credit_limit: 9_999_999_999 })
    expect(creditLimitPatch('12345678901')).toEqual({})
  })
})

describe('el cupo no se suma a nada', () => {
  it('los totales de deudas son iguales con y sin cupo', () => {
    const now = new Date(2026, 10, 23)
    const a = summarizeDebts([debt()], [], now, [])
    const b = summarizeDebts([debt({ credit_limit: 960_000 })], [], now, [])
    const nums = ({ remaining, monthly, interest, freeInMonths }: typeof a) => ({ remaining, monthly, interest, freeInMonths })
    expect(nums(b)).toEqual(nums(a))
    expect(b.remaining).toBe(1_056_339)
  })
})

describe('alerta de tarjeta pasada del cupo', () => {
  const me = { user_id: 'a', display_name: 'Ana', color: 'blue', household_id: 'h', joined_at: '' }
  const hh = { household: { id: 'h', name: 'Casa', invite_code: null, created_at: '' }, members: [me], me, everyone: [me] } as never
  const run = (d: Debt) =>
    smartAlerts({ hh, data: { debts: [d], debtPayments: [], expenses: [], cardExpenses: [], recurring: [], incomes: [], salary: null, contributions: [], categories: [], financeReady: false } as never, month: new Date(2026, 10, 1), now: new Date(2026, 10, 23), myCost: 0 })
  it('avisa con el monto excedido', () => {
    const a = run(debt({ credit_limit: 960_000 })).find((x) => x.id.startsWith('card-over:'))
    expect(a?.title).toContain('pasó su cupo por')
    expect(a?.title).toContain('96.339')
    expect(a?.level).toBe('warn')
  })
  it('sin exceso o sin cupo no avisa', () => {
    expect(run(debt({ credit_limit: 2_000_000 })).some((x) => x.id.startsWith('card-over:'))).toBe(false)
    expect(run(debt()).some((x) => x.id.startsWith('card-over:'))).toBe(false)
  })
})

describe('cupo: el campo no trunca en silencio (escribe 12345678901)', () => {
  it('creditLimitInput deja escribir 11 dígitos para poder avisar, y ninguno más', () => {
    expect(creditLimitInput('12345678901')).toBe('12345678901')
    expect(creditLimitInput('1.234.567.890.123')).toBe('12345678901')
    expect(creditLimitInput('9a6b0')).toBe('960')
  })
  it('con 11 dígitos escritos sale el aviso y no se manda el cupo (antes quedaba 960.000.123 en silencio)', () => {
    const typed = creditLimitInput('12345678901')
    expect(creditLimitProblem(typed)).toBe('El cupo no es válido. Escribe hasta 10 dígitos.')
    expect(creditLimitPatch(typed)).toEqual({})
  })
  it('con 10 dígitos no hay aviso', () => {
    expect(creditLimitProblem(creditLimitInput('1234567890'))).toBeNull()
  })
})

describe('cupo: editor y asistente avisan en vivo y bloquean (JSX)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  it.each(['../screens/Money.tsx', '../components/DebtGuidedForm.tsx'])('%s usa creditLimitInput y muestra el aviso', (p) => {
    const src = read(p)
    expect(src).toContain('creditLimitInput(e.target.value)')
    expect(src).not.toMatch(/setLimit\(digitsOnly/)
    expect(src).toMatch(/role="alert">\{limitProblem\}/)
  })
  it('el editor bloquea Guardar y el asistente bloquea Siguiente con el cupo inválido', () => {
    expect(read('../screens/Money.tsx')).toContain("disabled={busy || limitProblem !== null}")
    expect(read('../components/DebtGuidedForm.tsx')).toContain('limit: limitProblem === null')
  })
})
