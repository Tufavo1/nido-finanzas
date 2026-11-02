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
  /** Nombre del hogar */
  name: string
  /** Primeros caracteres del id: sirve para distinguir hogares con el mismo nombre */
  code: string
  created_at: string
  active_members: number
  last_activity: string
  expenses: number
  /** El hogar del propio administrador nunca aparece en la lista */
  deletable: boolean
  /** Nombre con que cada persona aparece en su hogar. Sin correo ni id de cuenta: la referencia es opaca y solo sirve dentro del hogar */
  members: { ref: string; name: string; joined_at: string }[]
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

export interface AdminNote {
  level: 'bad' | 'warn' | 'ok'
  title: string
  text: string
}

const pctOf = (a: number, b: number): number => (b > 0 ? Math.round((a * 100) / b) : 0)

/** Indicadores simples para entender de un vistazo si la app va bien (todo en porcentajes, sin datos de nadie) */
export function adminRates(s: AdminStats) {
  return {
    /** De quienes se registraron, cuántos entraron en el último mes */
    stay: pctOf(s.users.active_30d, s.users.total),
    /** De quienes entraron esta semana, cuántos anotaron al menos un gasto */
    usesIt: pctOf(s.usage.users_with_expense_7d, s.users.active_7d),
    /** De los hogares, cuántos ya tienen a la pareja adentro */
    couples: pctOf(s.households.couples, s.households.total),
    confirmed: pctOf(s.users.confirmed, s.users.total),
  }
}

/** Avisos ordenados del más urgente al más tranquilo; si no hay nada que atender devuelve un solo "todo bien" */
export function adminNotes(s: AdminStats): AdminNote[] {
  const r = adminRates(s)
  const out: AdminNote[] = []
  const dbPct = pctOf(s.db_bytes, FREE_LIMITS.dbBytes)
  if (dbPct >= 80) out.push({ level: 'bad', title: 'Se está llenando la base de datos', text: `Usas el ${dbPct} % del espacio gratuito. Conviene limpiar hogares vacíos o pasar a un plan de pago.` })
  else if (dbPct >= 50) out.push({ level: 'warn', title: 'La base de datos ya va por la mitad', text: `Usas el ${dbPct} % del espacio gratuito. Aún hay margen, pero vale la pena vigilarlo.` })
  const unconfirmed = s.users.total - s.users.confirmed
  if (unconfirmed > 0 && r.confirmed < 80) out.push({ level: 'warn', title: 'Mucha gente no confirma su correo', text: `${unconfirmed} de ${s.users.total} personas no confirmaron. Puede que los correos de confirmación no estén llegando o caigan en spam.` })
  if (s.users.total > 0 && s.users.active_7d === 0) out.push({ level: 'warn', title: 'Nadie entró esta semana', text: 'Ninguna cuenta abrió la app en los últimos 7 días.' })
  else if (s.users.active_7d > 0 && s.usage.users_with_expense_7d === 0) out.push({ level: 'warn', title: 'Entran, pero nadie anota gastos', text: 'Hay gente entrando, pero esta semana no se registró ningún gasto. Puede que cueste entender cómo empezar.' })
  if (s.households.total >= 4 && r.couples < 40) out.push({ level: 'warn', title: 'Pocas parejas completas', text: `Solo el ${r.couples} % de los hogares tiene a las dos personas. Muchos se quedan esperando que la pareja se una.` })
  if (out.length === 0) out.push({ level: 'ok', title: 'Todo en orden', text: 'No hay nada que atender ahora. Los indicadores de uso y de espacio están sanos.' })
  return out.sort((a, b) => ({ bad: 0, warn: 1, ok: 2 })[a.level] - ({ bad: 0, warn: 1, ok: 2 })[b.level])
}
