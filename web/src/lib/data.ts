import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Tables } from './database.types'
import { monthRange } from './format'

export type Category = Tables<'categories'>
export type Expense = Tables<'expenses'>
export type Goal = Tables<'goals'>
export type Contribution = Tables<'contributions'>

export interface HouseholdData {
  categories: Category[]
  expenses: Expense[]
  goals: Goal[]
  contributions: Contribution[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useData(householdId: string): HouseholdData {
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    const { start, end } = monthRange()
    const [c, e, g, k] = await Promise.all([
      supabase.from('categories').select('*').eq('household_id', householdId).eq('archived', false).order('position'),
      supabase
        .from('expenses')
        .select('*')
        .eq('household_id', householdId)
        .gte('spent_on', start)
        .lt('spent_on', end)
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('goals').select('*').eq('household_id', householdId).eq('archived', false).order('created_at'),
      supabase.from('contributions').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
    ])
    if (mine !== seq.current) return
    const err = c.error ?? e.error ?? g.error ?? k.error
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setCategories(c.data ?? [])
    setExpenses(e.data ?? [])
    setGoals(g.data ?? [])
    setContributions(k.data ?? [])
    setError(null)
    setLoading(false)
  }, [householdId])

  useEffect(() => {
    void refresh()
    const channel = supabase.channel(`hh-${householdId}`)
    for (const table of ['expenses', 'contributions', 'goals', 'categories'] as const) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        () => {
          void refresh()
        },
      )
    }
    channel.subscribe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [householdId, refresh])

  return { categories, expenses, goals, contributions, loading, error, refresh }
}
