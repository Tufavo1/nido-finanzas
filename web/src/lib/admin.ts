import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Solo sirve para decidir si se muestra el acceso al panel. La seguridad real está en la base:
 * la función admin_stats() rechaza a cualquier otra cuenta.
 */
export const ADMIN_EMAIL = 'joseromeroesteban353@gmail.com'

/** Límites del plan gratuito de Supabase, para mostrar cuánto queda */
export const FREE_LIMITS = { dbBytes: 500 * 1024 * 1024, monthlyUsers: 50_000 }

export interface AdminStats {
  generated_at: string
  db_bytes: number
  users: { total: number; confirmed: number; new_7d: number; new_30d: number; active_1d: number; active_7d: number; active_30d: number }
  households: { total: number; couples: number; solo: number }
  usage: { expenses_total: number; expenses_7d: number; expenses_30d: number; users_with_expense_7d: number }
  features: { name: string; unit: 'hogares' | 'personas'; count: number }[]
  daily: { day: string; signups: number; expenses: number }[]
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats' as never)
  if (error) throw error
  return data as unknown as AdminStats
}

/** true si la sesión actual es la de la cuenta administradora */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setIsAdmin(data.session?.user.email?.toLowerCase() === ADMIN_EMAIL)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return isAdmin
}

export interface AdminHousehold {
  id: string
  /** Primeros caracteres del id: sirve para distinguirlos sin mostrar nombres */
  code: string
  created_at: string
  active_members: number
  last_activity: string
  expenses: number
  /** Cumple la regla del servidor: vacío, o 1 persona sin movimiento hace 7 días o más */
  deletable: boolean
}

export async function fetchEmptyHouseholds(): Promise<AdminHousehold[]> {
  const { data, error } = await supabase.rpc('admin_households' as never)
  if (error) throw error
  return (data ?? []) as unknown as AdminHousehold[]
}

export async function deleteHouseholds(ids: string[]): Promise<{ deleted: number; skipped: number }> {
  const { data, error } = await supabase.rpc('admin_delete_households' as never, { p_ids: ids } as never)
  if (error) throw error
  return data as unknown as { deleted: number; skipped: number }
}
