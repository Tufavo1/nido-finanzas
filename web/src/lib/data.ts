import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Tables } from './database.types'
import { toISO } from './format'

export type Category = Tables<'categories'>
export type Expense = Tables<'expenses'>
export type Goal = Tables<'goals'>
export type Contribution = Tables<'contributions'>

export interface HouseholdData {
  categories: Category[]
  /** Gastos del mes seleccionado */
  expenses: Expense[]
  /** Gastos del mes anterior, para comparar */
  prevExpenses: Expense[]
  goals: Goal[]
  contributions: Contribution[]
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

    const [cats, exps, gls, cons] = await Promise.all([
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
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [householdId])

  return {
    categories,
    expenses,
    prevExpenses,
    goals,
    contributions,
    ready: loadedKey !== null,
    loading: loadedKey !== key,
    error,
    refresh,
  }
}