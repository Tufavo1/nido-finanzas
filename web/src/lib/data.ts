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
export type Profile = Tables<'profiles'>
export type Income = Tables<'incomes'>
export type Recurring = Tables<'recurring_expenses'>

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
  /** Mis ingresos extra del mes seleccionado (privados, como el sueldo) */
  incomes: Income[]
  /** Gastos fijos del hogar */
  recurring: Recurring[]
  /** Perfiles (profesión) de las personas del hogar */
  profiles: Profile[]
  /** false si la tabla de perfiles aún no existe (migración pendiente) */
  profileReady: boolean
  /** false si las tablas de sueldo/deudas aún no existen en la base (migración pendiente) */
  financeReady: boolean
  /** Ya se cargó al menos una vez */
  ready: boolean
  /** Se está cargando el mes seleccionado */
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useData(
  householdId: string,
  userId: string,
  year: number,
  monthIndex: number,
  /** Se llama cuando cambia quién está en el hogar (entra o sale la pareja) */
  onMembersChange?: () => void,
): HouseholdData {
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [prevExpenses, setPrevExpenses] = useState<Expense[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([])
  const [salary, setSalary] = useState<Salary | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [recurring, setRecurring] = useState<Recurring[]>([])
  const [profileReady, setProfileReady] = useState(true)
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

    const [cats, exps, gls, cons, sal, dts, pays, profs, incs, recs] = await Promise.all([
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
      supabase.from('profiles').select('*').eq('household_id', householdId),
      supabase
        .from('incomes')
        .select('*')
        .eq('household_id', householdId)
        .gte('received_on', start)
        .lt('received_on', end)
        .order('received_on', { ascending: false }),
      supabase.from('recurring_expenses').select('*').eq('household_id', householdId).order('day_of_month'),
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
    setProfileReady(!profs.error)
    setProfiles(profs.error ? [] : (profs.data ?? []))
    setIncomes(incs.error ? [] : (incs.data ?? []))
    setRecurring(recs.error ? [] : (recs.data ?? []))
    setError(null)
    setLoadedKey(thisKey)
  }, [householdId, year, monthIndex])

  const refreshRef = useRef(refresh)
  const membersRef = useRef(onMembersChange)
  useEffect(() => {
    refreshRef.current = refresh
    membersRef.current = onMembersChange
  }, [refresh, onMembersChange])

  // Carga al abrir y cada vez que cambia el mes
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Gastos fijos: se generan al abrir la app y al volver a ella (por si cambió el día)
  useEffect(() => {
    let cancelled = false
    const apply = async () => {
      const { data: created } = await supabase.rpc('apply_recurring')
      if (!cancelled && created) void refreshRef.current()
    }
    void apply()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void apply()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [householdId])

  // Tiempo real por canales privados: 'hh:<hogar>' solo lo escuchan sus miembros y
  // 'u:<usuario>' solo la misma persona (sueldo e ingresos). Solo avisan qué tabla cambió.
  useEffect(() => {
    let cancelled = false
    const channels = [`hh:${householdId}`, `u:${userId}`].map((topic) =>
      supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'change' }, ({ payload }: { payload?: { table?: string } }) => {
          if (payload?.table === 'members' || payload?.table === 'households') membersRef.current?.()
          void refreshRef.current()
        }),
    )
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) for (const ch of channels) ch.subscribe()
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      for (const ch of channels) void supabase.removeChannel(ch)
    }
  }, [householdId, userId])

  return {
    categories,
    expenses,
    prevExpenses,
    goals,
    contributions,
    debts,
    debtPayments,
    salary,
    profiles,
    incomes,
    recurring,
    profileReady,
    financeReady,
    ready: loadedKey !== null,
    loading: loadedKey !== key,
    error,
    refresh,
  }
}