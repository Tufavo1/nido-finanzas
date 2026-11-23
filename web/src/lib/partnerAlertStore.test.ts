// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { createPartnerAlertStore, DEFAULT_PARTNER_ALERT, NotAvailableError } from './partnerAlerts'

const client = (row: unknown, error: { code?: string } | null = null, rpcError: { code?: string } | null = null) => {
  const calls: unknown[] = []
  return {
    calls,
    c: {
      from: () => ({ select: () => ({ maybeSingle: async () => ({ data: row, error }) }) }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args])
        return { error: rpcError }
      },
    },
  }
}

describe('partnerAlertStore (tabla big_spend_alert_prefs + RPC)', () => {
  it('sin fila usa los valores por defecto: apagado y 50.000', async () => {
    expect(await createPartnerAlertStore(client(null).c).load()).toEqual(DEFAULT_PARTNER_ALERT)
  })
  it('lee la fila propia', async () => {
    expect(await createPartnerAlertStore(client({ enabled: true, threshold_clp: 80000 }).c).load()).toEqual({ enabled: true, thresholdClp: 80_000 })
  })
  it('guarda por la RPC con los nombres de parametro de la base', async () => {
    const { c, calls } = client(null)
    await createPartnerAlertStore(c).save({ enabled: true, thresholdClp: 120_000 })
    expect(calls).toEqual([['set_big_spend_alert', { p_enabled: true, p_threshold_clp: 120_000 }]])
  })
  it('si la migracion no esta aplicada, NotAvailableError', async () => {
    await expect(createPartnerAlertStore(client(null, { code: '42P01' }).c).load()).rejects.toBeInstanceOf(NotAvailableError)
    await expect(createPartnerAlertStore(client(null, null, { code: '42883' }).c).save({ enabled: true, thresholdClp: 5 })).rejects.toBeInstanceOf(NotAvailableError)
  })
})
