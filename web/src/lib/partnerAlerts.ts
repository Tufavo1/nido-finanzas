// Copyright (c) 2026 Dinovance
// Preferencia «avisarme de gastos mayores de mi pareja». DISEÑADA POR TIPOS: la tabla o la RPC de Supabase las
// expone el backend; cuando existan, solo hay que reemplazar `partnerAlertStore` por una implementación real.
import { DEFAULT_PARTNER_THRESHOLD } from './bankAuto'
import { supabase } from './supabase'

export interface PartnerAlertPref {
  enabled: boolean
  thresholdClp: number
}

export interface PartnerAlertStore {
  load(): Promise<PartnerAlertPref>
  save(pref: PartnerAlertPref): Promise<void>
}

export const DEFAULT_PARTNER_ALERT: PartnerAlertPref = { enabled: false, thresholdClp: DEFAULT_PARTNER_THRESHOLD }

/** La función aún no existe en el servidor */
export class NotAvailableError extends Error {
  constructor() {
    super('No disponible')
    this.name = 'NotAvailableError'
  }
}

export const unavailableStore: PartnerAlertStore = {
  load: () => Promise.reject(new NotAvailableError()),
  save: () => Promise.reject(new NotAvailableError()),
}

type RpcClient = {
  from(table: string): { select(cols: string): { maybeSingle(): PromiseLike<{ data: unknown; error: { code?: string } | null }> } }
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: { code?: string } | null }>
}

/** Con la tabla `big_spend_alert_prefs` (RLS: solo la fila propia) y la RPC `set_big_spend_alert`. Sin fila: valores por defecto. */
export function createPartnerAlertStore(client: RpcClient): PartnerAlertStore {
  return {
    async load() {
      const { data, error } = await client.from('big_spend_alert_prefs').select('enabled, threshold_clp').maybeSingle()
      if (error) throw error.code === '42P01' || error.code === 'PGRST205' ? new NotAvailableError() : new Error('No se pudo leer')
      const row = data as { enabled?: unknown; threshold_clp?: unknown } | null
      if (!row) return DEFAULT_PARTNER_ALERT
      const t = Number(row.threshold_clp)
      return { enabled: row.enabled === true, thresholdClp: Number.isSafeInteger(t) && t >= 1 ? t : DEFAULT_PARTNER_THRESHOLD }
    },
    async save(pref) {
      const { error } = await client.rpc('set_big_spend_alert', { p_enabled: pref.enabled, p_threshold_clp: pref.thresholdClp })
      if (error) throw error.code === '42883' || error.code === 'PGRST202' ? new NotAvailableError() : new Error('No se pudo guardar')
    },
  }
}

/** Implementación real; el front solo la usa en lugar del stub `unavailableStore`. */
export const partnerAlertStore: PartnerAlertStore = createPartnerAlertStore(supabase as unknown as RpcClient)
