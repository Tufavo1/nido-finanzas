import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Tables } from './database.types'
import { toISO } from './format'

export type Category = Tables<'categories'>
export type Expense = Tables<'expenses'>
export type Goal = Tables<'goals'>
export type Contribution = Tables<'contributions'>
export type Debt = Tables<'debts'>
export type DebtPayment = Tables<'debt_payments'>
export type Salary = Tables<'salaries'>

export interface HouseholdData {
  categories: Category[]
  /** Gastos del mes seleccionado */
  expenses: Expense[]
  /** Gastos del mes anterior, para comparar */
  prevExpenses: Expense[]
  goals: Goal[]
  contributions: Contribution[]
  /** Deudas del hogar activas y todos sus pagos */
  debts: Debt[]
  debtPayments: DebtPayment[]
  /** Mi sueldo. La base solo entrega el propio; null si aún no lo he puesto. */
  salary: Salary | null
  /** false si las tablas de sueldo/deudas aún no existen en la base (migración pendiente) */
  financeReady: boolean
  /** Ya se cargó al menos una vez */
  ready: boolean
  /** Se está cargando el mes seleccionado */
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useData(householdId: string, year: number, monthIndex: number): HouseholdData {
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [prevExpenses, setPrevExpenses] = useState<Expense[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([])
  const [salary, setSalary] = useState<Salary | null>(null)
  const [financeReady, setFinanceReady] = useState(true)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const key = `${year}-${monthIndex}`

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    const thisKey = `${year}-${monthIndex}`
    const start = toISO(new Date(year, monthIndex, 1))
    const prevStart = toISO(new Date(year, monthIndex - 1, 1))
    const end = toISO(new Date(year, monthIndex + 1, 1))

    const [cats, exps, gls, cons, sal, dts, pays] = await Promise.all([
      supabase.from('categories').select('*').eq('household_id', householdId).eq('archived', false).order('position'),
      supabase
        .from('expenses')
        .select('*')
        .eq('household_id', householdId)
        .gte('spent_on', prevStart)
        .lt('spent_on', end)
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('goals').select('*').eq('household_id', householdId).eq('archived', false).order('created_at'),
      supabase.from('contributions').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
      supabase.from('salaries').select('*').maybeSingle(),
      supabase.from('debts').select('*').eq('household_id', householdId).eq('archived', false).order('created_at'),
      supabase.from('debt_payments').select('*').eq('household_id', householdId).order('paid_on', { ascending: false }),
    ])
    if (mine !== seq.current) return

    const err = cats.error ?? exps.error ?? gls.error ?? cons.error
    if (err) {
      setError(err.message)
      return
    }
    const rows = exps.data ?? []
    setCategories(cats.data ?? [])
    setExpenses(rows.filter((e) => e.spent_on >= start))
    setPrevExpenses(rows.filter((e) => e.spent_on < start))
    setGoals(gls.data ?? [])
    setContributions(cons.data ?? [])
    // Sueldo y deudas no deben tumbar el resto de la app si faltan en la base
    const finErr = sal.error ?? dts.error ?? pays.error
    setFinanceReady(!finErr)
    setSalary(finErr ? null : (sal.data ?? null))
    setDebts(finErr ? [] : (dts.data ?? []))
    setDebtPayments(finErr ? [] : (pays.data ?? []))
    setError(null)
    setLoadedKey(thisKey)
  }, [householdId, year, monthIndex])

  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  // Carga al abrir y cada vez que cambia el mes
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Tiempo real: una sola suscripción por hogar
  useEffect(() => {
    const channel = supabase.channel(`hh-${householdId}`)
    for (const table of ['expenses', 'contributions', 'goals', 'categories'] as const) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        () => {
          void refreshRef.current()
        },
      )
    }
    channel.subscribe()
    // Canal aparte: si estas tablas no existen, no afecta a los gastos
    const money = supabase.channel(`fin-${householdId}`)
    for (const table of ['debts', 'debt_payments', 'salaries'] as const) {
      money.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        () => {
          void refreshRef.current()
        },
      )
    }
    money.subscribe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
      void supabase.removeChannel(money)
    }
  }, [householdId])

  return {
    categories,
    expenses,
    prevExpenses,
    goals,
    contributions,
    debts,
    debtPayments,
    salary,
    financeReady,
    ready: loadedKey !== null,
    loading: loadedKey !== key,
    error,
    refresh,
  }
}