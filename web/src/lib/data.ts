import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Tables } from './database.types'
import { toISO } from './format'
import { fetchAllPages } from './paging'

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
  /** true si la última recarga de sueldo/deudas falló y se muestran los datos anteriores */
  financeStale: boolean
  /** Ya se cargó al menos una vez */
  ready: boolean
  /** Se está cargando el mes seleccionado */
  loading: boolean
  error: string | null
  /** Código de la respuesta que falló (403, 502…); 0 = sin conexión */
  errorStatus: number
  refresh: () => Promise<void>
}

type Group = 'month' | 'static'

/** Qué grupo de datos hay que recargar cuando cambia cada tabla */
const GROUPS_OF: Record<string, Group[]> = {
  expenses: ['month'],
  incomes: ['month'],
  categories: ['static'],
  goals: ['static'],
  contributions: ['static'],
  debts: ['static'],
  debt_payments: ['static'],
  salaries: ['static'],
  profiles: ['static'],
  recurring_expenses: ['static'],
  members: ['month', 'static'],
  households: ['month', 'static'],
}

/** Junta varios avisos seguidos (por ejemplo, al generarse varios gastos fijos) en una sola consulta */
const REFRESH_DEBOUNCE_MS = 350
/** Si la app estuvo oculta más que esto, al volver se refresca aunque no haya llegado ningún aviso */
const STALE_AFTER_MS = 30_000

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
  const [financeStale, setFinanceStale] = useState(false)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState(0)
  const [staticReady, setStaticReady] = useState(false)
  const monthSeq = useRef(0)
  const staticSeq = useRef(0)
  const key = `${year}-${monthIndex}`

  // Gastos e ingresos cambian con el mes elegido; todo lo demás (categorías, metas, deudas…) no.
  const loadMonth = useCallback(async () => {
    const mine = ++monthSeq.current
    const thisKey = `${year}-${monthIndex}`
    const start = toISO(new Date(year, monthIndex, 1))
    const prevStart = toISO(new Date(year, monthIndex - 1, 1))
    const end = toISO(new Date(year, monthIndex + 1, 1))
    const [exps, incs] = await Promise.all([
      supabase
        .from('expenses')
        .select('*')
        .eq('household_id', householdId)
        .gte('spent_on', prevStart)
        .lt('spent_on', end)
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('incomes')
        .select('*')
        .eq('household_id', householdId)
        .gte('received_on', start)
        .lt('received_on', end)
        .order('received_on', { ascending: false }),
    ])
    if (mine !== monthSeq.current) return
    if (exps.error) {
      setErrorStatus(exps.status)
      setError(exps.error.message)
      return
    }
    const rows = exps.data ?? []
    setExpenses(rows.filter((e) => e.spent_on >= start))
    setPrevExpenses(rows.filter((e) => e.spent_on < start))
    setIncomes(incs.error ? [] : (incs.data ?? []))
    setError(null)
    setLoadedKey(thisKey)
  }, [householdId, year, monthIndex])

  const loadStatic = useCallback(async () => {
    const mine = ++staticSeq.current
    const [cats, gls, cons, sal, dts, pays, profs, recs] = await Promise.all([
      supabase.from('categories').select('*').eq('household_id', householdId).eq('archived', false).order('position'),
      supabase.from('goals').select('*').eq('household_id', householdId).eq('archived', false).order('created_at'),
      fetchAllPages((from, to) =>
        supabase.from('contributions').select('*').eq('household_id', householdId).order('created_at', { ascending: false }).order('id').range(from, to),
      ),
      supabase.from('salaries').select('*').maybeSingle(),
      supabase.from('debts').select('*').eq('household_id', householdId).eq('archived', false).order('created_at'),
      fetchAllPages((from, to) =>
        supabase.from('debt_payments').select('*').eq('household_id', householdId).order('paid_on', { ascending: false }).order('id').range(from, to),
      ),
      supabase.from('profiles').select('*').eq('household_id', householdId),
      supabase.from('recurring_expenses').select('*').eq('household_id', householdId).order('day_of_month'),
    ])
    if (mine !== staticSeq.current) return
    const err = cats.error ?? gls.error ?? cons.error
    if (err) {
      // Las metas y categorías traen el código; si falló otra cosa se trata como falla del servicio
      setErrorStatus(cats.error ? cats.status : gls.error ? gls.status : 502)
      setError(err.message)
      return
    }
    setCategories(cats.data ?? [])
    setGoals(gls.data ?? [])
    setContributions(cons.data ?? [])
    // Sueldo y deudas no deben tumbar el resto de la app si faltan en la base
    const finErr = sal.error ?? dts.error ?? pays.error
    // Solo una tabla inexistente (migración pendiente) apaga la sección; un fallo pasajero conserva lo ya cargado
    const finMissing = !!finErr && (finErr.code === 'PGRST205' || finErr.code === '42P01')
    setFinanceReady(!finMissing)
    setFinanceStale(!!finErr && !finMissing)
    if (!finErr || finMissing) {
      setSalary(finErr ? null : (sal.data ?? null))
      setDebts(finErr ? [] : (dts.data ?? []))
      setDebtPayments(finErr ? [] : (pays.data ?? []))
    }
    setProfileReady(!profs.error)
    setProfiles(profs.error ? [] : (profs.data ?? []))
    setRecurring(recs.error ? [] : (recs.data ?? []))
    setStaticReady(true)
  }, [householdId])

  // Recarga completa: la usan las pantallas después de guardar algo propio
  const refresh = useCallback(async () => {
    await Promise.all([loadMonth(), loadStatic()])
  }, [loadMonth, loadStatic])

  const loadMonthRef = useRef(loadMonth)
  const loadStaticRef = useRef(loadStatic)
  const membersRef = useRef(onMembersChange)
  useEffect(() => {
    loadMonthRef.current = loadMonth
    loadStaticRef.current = loadStatic
    membersRef.current = onMembersChange
  }, [loadMonth, loadStatic, onMembersChange])

  // Al abrir: todo. Al cambiar de mes: solo gastos e ingresos del mes nuevo.
  useEffect(() => {
    void loadStatic()
  }, [loadStatic])
  useEffect(() => {
    void loadMonth()
  }, [loadMonth])

  // Gastos fijos: se generan al abrir y, después, solo cuando cambia el día (no en cada vuelta a la app)
  const lastApplyDay = useRef('')
  useEffect(() => {
    let cancelled = false
    const apply = async () => {
      const today = toISO(new Date())
      if (today === lastApplyDay.current) return
      lastApplyDay.current = today
      const { data: created } = await supabase.rpc('apply_recurring')
      if (!cancelled && created) void loadMonthRef.current()
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
  // Cada aviso recarga únicamente el grupo afectado, junta ráfagas en una sola consulta y,
  // si la app está en segundo plano, espera a que vuelvas para recargar una vez.
  useEffect(() => {
    let cancelled = false
    const dirty = new Set<Group>()
    let timer: number | undefined
    let hiddenAt = 0

    const flush = () => {
      timer = undefined
      if (dirty.has('month')) void loadMonthRef.current()
      if (dirty.has('static')) void loadStaticRef.current()
      dirty.clear()
    }
    const mark = (groups: Group[]) => {
      for (const g of groups) dirty.add(g)
      if (document.visibilityState === 'hidden') return
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, REFRESH_DEBOUNCE_MS)
    }

    const channels = [`hh:${householdId}`, `u:${userId}`].map((topic) =>
      supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'change' }, ({ payload }: { payload?: { table?: string } }) => {
          const table = payload?.table ?? ''
          if (table === 'members' || table === 'households') membersRef.current?.()
          mark(GROUPS_OF[table] ?? ['month', 'static'])
        }),
    )
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) for (const ch of channels) ch.subscribe()
    })

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (dirty.size > 0) flush()
      else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) {
        dirty.add('month')
        dirty.add('static')
        flush()
      }
      hiddenAt = 0
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
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
    financeStale,
    ready: loadedKey !== null && staticReady,
    loading: loadedKey !== key,
    error,
    errorStatus,
    refresh,
  }
}