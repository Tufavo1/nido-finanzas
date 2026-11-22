// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { buildAutoCategories, parseAutoSaved, ownerKeyOf, pendingToSendCount, createPluginSecureBackend, needsPermissionGuide, parseNativeDraft, parseNotifyingApp, readDrafts, readRecentApps, type CaptureStatus } from './nativeBridge'

const valid = {
  id: 'd-1',
  amountClp: 12_990,
  merchant: 'Almacen Demo Spa',
  kind: 'EXPENSE',
  confidence: 'HIGH',
  installment: null,
  fingerprint: 'a'.repeat(64),
  postedAtMillis: 1_795_273_230_000,
  createdAtMillis: 1_795_273_231_000,
  status: 'PENDING',
}

describe('parseNativeDraft (frontera con el plugin)', () => {
  it('acepta un borrador completo', () => {
    expect(parseNativeDraft(valid)).toEqual(valid)
  })

  it('el comercio ausente queda null y una cuota válida se conserva', () => {
    const { merchant: _m, ...sinComercio } = valid
    expect(parseNativeDraft({ ...sinComercio, installment: { n: 1, total: 3 } })).toMatchObject({ merchant: null, installment: { n: 1, total: 3 } })
  })

  it.each([
    ['no es objeto', 'texto'],
    ['sin id', { ...valid, id: '' }],
    ['monto cero', { ...valid, amountClp: 0 }],
    ['monto decimal', { ...valid, amountClp: 10.5 }],
    ['monto sobre el límite', { ...valid, amountClp: 10_000_000_000 }],
    ['tipo desconocido', { ...valid, kind: 'OTRO' }],
    ['confianza desconocida', { ...valid, confidence: 'MAX' }],
    ['estado desconocido', { ...valid, status: 'BORRADO' }],
    ['comercio demasiado largo', { ...valid, merchant: 'a'.repeat(61) }],
    ['cuota imposible', { ...valid, installment: { n: 4, total: 3 } }],
    ['fecha negativa', { ...valid, postedAtMillis: -1 }],
  ])('descarta: %s', (_nombre, raw) => {
    expect(parseNativeDraft(raw)).toBeNull()
  })
})

describe('readDrafts', () => {
  it('descarta lo inválido y ordena por antigüedad', async () => {
    const plugin = { listDrafts: async () => ({ drafts: [{ ...valid, id: 'nuevo', createdAtMillis: 2 }, null, { basura: 1 }, { ...valid, id: 'viejo', createdAtMillis: 1 }] }) }
    expect((await readDrafts(plugin)).map((d) => d.id)).toEqual(['viejo', 'nuevo'])
  })
})

describe('createPluginSecureBackend', () => {
  it('traduce al plugin y un valor ausente es null', async () => {
    const data = new Map<string, string>()
    const backend = createPluginSecureBackend({
      secureGet: async ({ key }) => ({ value: data.get(key) ?? null }),
      secureSet: async ({ key, value }) => void data.set(key, value),
      secureRemove: async ({ key }) => void data.delete(key),
    })
    expect(await backend.get('k')).toBeNull()
    await backend.set('k', 'v')
    expect(await backend.get('k')).toBe('v')
    await backend.remove('k')
    expect(await backend.get('k')).toBeNull()
  })
})

describe('needsPermissionGuide', () => {
  const base: CaptureStatus = {
    listenerAllowed: true, listenerConnected: true, revokedSinceConnected: false, notificationsAllowed: true, batteryOptimized: false,
    restrictedSettingsLikely: false, lastEventAt: null, lastHeartbeatAt: null, failures: 0, lastFailureClass: null, whitelistCount: 1, hideOnLockScreen: true,
  }
  it('todo bien: no hace falta guiar', () => expect(needsPermissionGuide(base)).toBe(false))
  it('permiso revocado: sí', () => expect(needsPermissionGuide({ ...base, listenerAllowed: false, revokedSinceConnected: true })).toBe(true))
  it('lista con apps pero sin permiso: sí', () => expect(needsPermissionGuide({ ...base, listenerAllowed: false })).toBe(true))
  it('sin apps en la lista la captura está apagada: no molesta', () => expect(needsPermissionGuide({ ...base, listenerAllowed: false, whitelistCount: 0 })).toBe(false))
})

describe('apps que avisaron recientemente', () => {
  const app = { packageName: 'cl.demo.banco', label: 'Banco Demo', lastSeenMillis: 5 }

  it('acepta una app válida y usa el paquete como nombre si falta', () => {
    expect(parseNotifyingApp(app)).toEqual(app)
    expect(parseNotifyingApp({ ...app, label: '  ' })).toMatchObject({ label: 'cl.demo.banco' })
  })

  it.each([
    ['paquete con símbolos', { ...app, packageName: 'x; drop' }],
    ['paquete sin punto', { ...app, packageName: 'banco' }],
    ['hora negativa', { ...app, lastSeenMillis: -1 }],
    ['no es objeto', 7],
  ])('descarta: %s', (_n, raw) => expect(parseNotifyingApp(raw)).toBeNull())

  it('solo expone paquete, nombre y hora (nunca texto) y ordena por reciente', async () => {
    const plugin = { getRecentNotifyingApps: async () => ({ apps: [app, { ...app, packageName: 'cl.demo.billetera', lastSeenMillis: 9, text: 'Compra $12.990' }, null] }) }
    const apps = await readRecentApps(plugin)
    expect(apps.map((a) => a.packageName)).toEqual(['cl.demo.billetera', 'cl.demo.banco'])
    expect(Object.keys(apps[0]!).sort()).toEqual(['label', 'lastSeenMillis', 'packageName'])
  })
})

describe('dueño, duplicados y contador (fase verde QA)', () => {
  const base = { id: 'a', amountClp: 1000, merchant: null, kind: 'EXPENSE', confidence: 'HIGH', installment: null, fingerprint: 'f', postedAtMillis: 1, createdAtMillis: 1, status: 'CONFIRMED' }
  it('parseNativeDraft conserva possibleDuplicate y el paquete de origen, y los omite si no vienen', () => {
    expect(parseNativeDraft({ ...base, possibleDuplicate: true, sourcePackage: 'cl.demo.banco' })).toMatchObject({ possibleDuplicate: true, sourcePackage: 'cl.demo.banco' })
    expect(parseNativeDraft(base)).not.toHaveProperty('possibleDuplicate')
    expect(parseNativeDraft({ ...base, possibleDuplicate: 'si' })).not.toHaveProperty('possibleDuplicate')
  })
  it('pendingToSendCount cuenta solo los confirmados', async () => {
    const plugin = { listDrafts: async () => ({ drafts: [base, { ...base, id: 'b', status: 'PENDING' }, { ...base, id: 'c' }] }) }
    expect(await pendingToSendCount(plugin)).toBe(2)
  })
  it('ownerKeyOf une usuario y hogar', () => {
    expect(ownerKeyOf('u1', 'h1')).toBe('u1:h1')
  })
})

describe('registro automático: contratos', () => {
  it('parseAutoSaved descarta lo que no tenga la forma exacta', () => {
    const ok = { id: 'a', amount: 6500, note: 'Cafe Demo', at: 1, synced: false }
    expect(parseAutoSaved({ items: [{ ...ok, status: 'rejected' }] })[0]?.status).toBe('rejected')
    expect(parseAutoSaved({ items: [ok, { ...ok, id: '' }, { ...ok, amount: 0 }, { ...ok, synced: 'si' }, null, 3] })).toEqual([{ ...ok, status: 'pending' }])
    expect(parseAutoSaved(undefined)).toEqual([])
  })
  it('buildAutoCategories usa la más usada y la clave de primera palabra, sin tildes', () => {
    const valid = new Set(['c1', 'c2'])
    const out = buildAutoCategories(
      [
        { note: 'Café Demo Norte', category_id: 'c1' },
        { note: 'cafe demo norte', category_id: 'c2' },
        { note: 'Cafe Demo Norte', category_id: 'c2' },
        { note: 'Algo', category_id: 'zzz' },
        { note: null, category_id: 'c1' },
      ],
      valid,
    )
    expect(out).toContainEqual({ key: 'cafe demo norte', categoryId: 'c2' })
    expect(out).toContainEqual({ key: 'w:cafe', categoryId: 'c2' })
    expect(out.some((e) => e.key === 'algo')).toBe(false)
  })
})
