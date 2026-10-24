import { useEffect, useState } from 'react'
import { supabase } from './supabase'

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

/** 'none': no es administrador · 'needs_mfa': lo es, pero falta verificar el segundo factor · 'ok' */
export type AdminStatus = 'none' | 'needs_mfa' | 'ok'

/** Solo decide qué se muestra: la seguridad real está en la base, que rechaza toda función admin_* sin aal2 */
export async function fetchAdminStatus(): Promise<AdminStatus> {
  const { data, error } = await supabase.rpc('admin_status' as never)
  if (error) throw error
  return data === 'ok' || data === 'needs_mfa' ? data : 'none'
}

export function useAdminStatus(): { status: AdminStatus; refresh: () => void } {
  const [status, setStatus] = useState<AdminStatus>('none')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    void fetchAdminStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus('none'))
    return () => {
      cancelled = true
    }
  }, [tick])
  return { status, refresh: () => setTick((t) => t + 1) }
}

/** true si la cuenta es administradora (aunque falte el segundo factor): sirve para mostrar el acceso al panel */
export function useIsAdmin(): boolean {
  return useAdminStatus().status !== 'none'
}

export interface AdminHousehold {
  id: string
  /** Primeros caracteres del id: sirve para distinguirlos sin mostrar nombres */
  code: string
  created_at: string
  active_members: number
  last_activity: string
  expenses: number
  /** El hogar del propio administrador nunca aparece en la lista */
  deletable: boolean
  /** Sin nombres ni ids de cuenta: cada persona se identifica con una referencia opaca */
  members: { ref: string; joined_at: string }[]
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

export async function removeMember(householdId: string, ref: string): Promise<{ removed: boolean; household_deleted: boolean }> {
  const { data, error } = await supabase.rpc('admin_remove_member' as never, { p_household: householdId, p_ref: ref } as never)
  if (error) throw error
  return data as unknown as { removed: boolean; household_deleted: boolean }
}

export interface AdminStorage {
  db_bytes: number
  public_bytes: number
  tables: { name: string; bytes: number }[]
  bytes_per_day: number
}

export async function fetchAdminStorage(): Promise<AdminStorage> {
  const { data, error } = await supabase.rpc('admin_storage' as never)
  if (error) throw error
  return data as unknown as AdminStorage
}
