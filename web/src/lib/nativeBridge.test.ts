// Copyright (c) 2026 Dinovance
import { describe, expect, it } from 'vitest'
import { buildAutoCategories, parseAutoSaved, ownerKeyOf, pendingToSendCount, createPluginSecureBackend, needsPermissionGuide, clearPendingDrafts, parseNativeDraft, parseSyncNowResult, wipeCapturedAll, countUnsentSaved, parseNotifyingApp, readDrafts, readRecentApps, type CaptureStatus } from './nativeBridge'

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
    expect(parseAutoSaved({ items: [ok, { ...ok, id: '' }, { ...ok, amount: 0 }, { ...ok, synced: 'si' }, null, 3] })).toEqual([{ ...ok, status: 'pending', kind: 'expense' }])
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

describe('actualizaciones', () => {
  it('parseUpdateCheck valida la respuesta', async () => {
    const { parseUpdateCheck } = await import('./nativeBridge')
    expect(parseUpdateCheck({ available: false })).toEqual({ available: false })
    expect(parseUpdateCheck(null)).toEqual({ available: false })
    expect(parseUpdateCheck({ available: true, versionName: '1.3.0' })).toEqual({ available: false })
    expect(parseUpdateCheck({ available: true, versionName: '1.3.0', versionCode: 10300, sizeBytes: 5, notes: 'x' })).toEqual({ available: true, versionName: '1.3.0', versionCode: 10300, sizeBytes: 5, notes: 'x' })
    expect(parseUpdateCheck({ available: true, versionName: '1.3.0', versionCode: 10300, sizeBytes: 5, notes: null }).notes).toBeNull()
  })
  it('updateErrorCode reconoce codigos y cae a INSTALL_FAILED', async () => {
    const { updateErrorCode } = await import('./nativeBridge')
    expect(updateErrorCode({ code: 'HASH_MISMATCH' })).toBe('HASH_MISMATCH')
    expect(updateErrorCode({ code: 'INSTALL_NOT_ALLOWED' })).toBe('INSTALL_NOT_ALLOWED')
    expect(updateErrorCode({ code: 'raro' })).toBe('INSTALL_FAILED')
    expect(updateErrorCode(null)).toBe('INSTALL_FAILED')
  })
})

describe('adaptadores de bancos detectados y diagnostico', () => {
  it('adaptDetectedBanks: bankId a id, solo installed o seen, sin repetidos ni basura', async () => {
    const { adaptDetectedBanks } = await import('./nativeBridge')
    const raw = { detected: [
      { bankId: 'santander', appLabel: 'Santander', packageName: 'x.s', status: 'installed' },
      { bankId: 'banco-estado', appLabel: 'CuentaRUT', packageName: 'x.cr', status: 'installed' },
      { bankId: 'banco-estado', appLabel: 'BancoEstado', packageName: 'x.be', status: 'installed' },
      { bankId: 'banco-chile', appLabel: null, packageName: 'x.c', status: 'seen' },
      { bankId: 'banco-falabella', appLabel: null, packageName: null, status: 'not_found' },
      { bankId: 5, packageName: 'x', status: 'installed' }, null, 'x',
    ] }
    expect(adaptDetectedBanks(raw)).toEqual({ banks: [{ id: 'santander', packageName: 'x.s' }, { id: 'banco-estado', packageName: 'x.cr' }, { id: 'banco-chile', packageName: 'x.c' }] })
    expect(adaptDetectedBanks(null)).toEqual({ banks: [] })
    expect(adaptDetectedBanks({ detected: 'no' })).toEqual({ banks: [] })
  })
  it('adaptDiagnostics: atMillis a at, motivos al mas cercano y desconocidos tal cual', async () => {
    const { adaptDiagnostics } = await import('./nativeBridge')
    const row = (reason: string, extra: object = {}) => ({ reason, atMillis: 5, maskedText: 'Compra $#.###', ...extra })
    const out = adaptDiagnostics({ items: [row('NOT_AN_EXPENSE'), row('AMBIGUOUS_AMOUNT'), row('NO_AMOUNT'), row('INCOME'), row('BANK_OFF'), row('NO_SESSION'), row('NO_PROFILE'), row('CAP_EXCEEDED'), row('CATEGORY_UNKNOWN', { maskedText: '' }), { reason: 'X' }, null] })
    expect(out.items.map((i) => i.reason)).toEqual(['NO_AMOUNT', 'NO_AMOUNT', 'NO_AMOUNT', 'INCOME', 'BANK_OFF', 'LOGIN_REQUIRED', 'LOGIN_REQUIRED', 'CAP_EXCEEDED', 'CATEGORY_UNKNOWN'])
    expect(out.items[0]).toEqual({ reason: 'NO_AMOUNT', at: 5, maskedText: 'Compra $#.###' })
    expect(out.items[8]).toEqual({ reason: 'CATEGORY_UNKNOWN', at: 5 })
    expect(adaptDiagnostics(undefined)).toEqual({ items: [] })
    expect(adaptDiagnostics({ items: Array.from({ length: 30 }, () => row('NO_AMOUNT')) }).items).toHaveLength(20)
  })
})

describe('adaptDiagnostics: pista aditiva', () => {
  it('pasa la pista si viene y la omite si no', async () => {
    const { adaptDiagnostics } = await import('./nativeBridge')
    const r = adaptDiagnostics({ items: [{ reason: 'NO_AMOUNT', atMillis: 1, hint: 'EMPTY', shape: { title: 0 } }, { reason: 'INCOME', atMillis: 2, hint: null }] })
    expect(r.items[0]).toEqual({ reason: 'NO_AMOUNT', at: 1, hint: 'EMPTY' })
    expect(r.items[1]).toEqual({ reason: 'INCOME', at: 2 })
  })
})

describe('parseNativeDraft: cuotas (installmentRole / Count / ValueClp)', () => {
  const cuotas = { ...valid, installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000 }
  it('conserva los tres campos válidos', () => {
    expect(parseNativeDraft(cuotas)).toMatchObject({ installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000 })
    expect(parseNativeDraft({ ...cuotas, installmentRole: 'PRIOR_CHARGE' })).toMatchObject({ installmentRole: 'PRIOR_CHARGE' })
  })
  it('null o ausentes: el borrador no los lleva (borradores antiguos)', () => {
    const nulos = parseNativeDraft({ ...valid, installmentRole: null, installmentCount: null, installmentValueClp: null })!
    expect(nulos.installmentRole).toBeUndefined()
    expect(nulos.installmentCount).toBeUndefined()
    expect(nulos.installmentValueClp).toBeUndefined()
    expect(parseNativeDraft(valid)).toEqual(valid)
  })
  it.each([
    ['rol desconocido', { installmentRole: 'OTRO' }, 'installmentRole'],
    ['rol no texto', { installmentRole: 1 }, 'installmentRole'],
    ['cantidad 1', { installmentCount: 1 }, 'installmentCount'],
    ['cantidad decimal', { installmentCount: 2.5 }, 'installmentCount'],
    ['cantidad texto', { installmentCount: '3' }, 'installmentCount'],
    ['cuota cero', { installmentValueClp: 0 }, 'installmentValueClp'],
    ['cuota negativa', { installmentValueClp: -5 }, 'installmentValueClp'],
    ['cuota decimal', { installmentValueClp: 10.5 }, 'installmentValueClp'],
    ['cuota sobre el límite', { installmentValueClp: 10_000_000_000 }, 'installmentValueClp'],
  ])('%s: descarta solo ese campo, no el borrador', (_n, malo, campo) => {
    const d = parseNativeDraft({ ...cuotas, ...malo })
    expect(d).not.toBeNull()
    expect(d).not.toHaveProperty(campo)
    expect(d).toMatchObject({ id: 'd-1', amountClp: 12_990 })
    for (const otro of ['installmentRole', 'installmentCount', 'installmentValueClp'].filter((c) => c !== campo)) expect(d).toHaveProperty(otro)
  })
})

describe('clearPendingDrafts: vaciar la bandeja sin perder lo guardado', () => {
  const row = (id: string, status: string) => ({ ...valid, id, status })
  it('borra solo los PENDING con removeDraft y conserva los CONFIRMED sin enviar', async () => {
    const removed: string[] = []
    const plugin = {
      listDrafts: async () => ({ drafts: [row('a', 'PENDING'), row('b', 'CONFIRMED'), row('c', 'PENDING'), null] }),
      removeDraft: async ({ id }: { id: string }) => void removed.push(id),
    }
    expect(await clearPendingDrafts(plugin)).toEqual({ removed: 2, keptSaved: 1 })
    expect(removed).toEqual(['a', 'c'])
  })
  it('si un borrado falla lanza (la pantalla avisa) y no sigue borrando a ciegas', async () => {
    const plugin = { listDrafts: async () => ({ drafts: [row('a', 'PENDING'), row('b', 'PENDING')] }), removeDraft: async () => Promise.reject(new Error('x')) }
    await expect(clearPendingDrafts(plugin)).rejects.toThrow()
  })
  it('un confirmado nunca se borra al vaciar la bandeja', async () => {
    const removed: string[] = []
    const plugin = { listDrafts: async () => ({ drafts: [row('z', 'CONFIRMED')] }), removeDraft: async ({ id }: { id: string }) => void removed.push(id) }
    expect(await clearPendingDrafts(plugin)).toEqual({ removed: 0, keptSaved: 1 })
    expect(removed).toEqual([])
  })
})

describe('parseNativeDraft: categoryId que entrega el plugin', () => {
  it('conserva un categoryId válido', () => {
    expect(parseNativeDraft({ ...valid, categoryId: 'cat-1' })).toMatchObject({ categoryId: 'cat-1' })
  })
  it.each([['vacío', ''], ['número', 5], ['con espacios o símbolos', 'a b<script>'], ['demasiado largo', 'a'.repeat(65)], ['null', null]])('descarta un categoryId %s sin perder el borrador', (_n, categoryId) => {
    const d = parseNativeDraft({ ...valid, categoryId })
    expect(d).not.toBeNull()
    expect(d).not.toHaveProperty('categoryId')
  })
})

describe('parseSyncNowResult: lo que responde syncNow', () => {
  it('lee las cuentas y el motivo', () => {
    expect(parseSyncNowResult({ sent: 2, failed: 1, needsPerson: 0, result: 'RETRY' })).toEqual({ sent: 2, failed: 1, needsPerson: 0, result: 'RETRY' })
  })
  it.each([undefined, null, 'ok', { sent: 1 }, { sent: -1, failed: 0, needsPerson: 0, result: 'ALL_SENT' }, { sent: 1, failed: 0, needsPerson: 0, result: 'RARO' }])('un nativo viejo o una respuesta rara da null: %j', (raw) => {
    expect(parseSyncNowResult(raw)).toBeNull()
  })
})

describe('clearPendingDrafts con clearPending nativo', () => {
  const row = (id: string, status: string) => ({ ...valid, id, status })
  it('usa clearPending y no el bucle de removeDraft', async () => {
    const removed: string[] = []
    const plugin = {
      listDrafts: async () => ({ drafts: [row('b', 'CONFIRMED')] }),
      removeDraft: async ({ id }: { id: string }) => void removed.push(id),
      clearPending: async () => ({ removed: 3 }),
    }
    expect(await clearPendingDrafts(plugin)).toEqual({ removed: 3, keptSaved: 1 })
    expect(removed).toEqual([])
  })
  it('STORE_UNAVAILABLE se propaga: no se borró nada y no se cae al bucle', async () => {
    const removed: string[] = []
    const plugin = {
      listDrafts: async () => ({ drafts: [row('a', 'PENDING')] }),
      removeDraft: async ({ id }: { id: string }) => void removed.push(id),
      clearPending: async () => Promise.reject(Object.assign(new Error('x'), { code: 'STORE_UNAVAILABLE' })),
    }
    await expect(clearPendingDrafts(plugin)).rejects.toMatchObject({ code: 'STORE_UNAVAILABLE' })
    expect(removed).toEqual([])
  })
  it('un nativo viejo (UNIMPLEMENTED) usa el bucle de siempre', async () => {
    const removed: string[] = []
    const plugin = {
      listDrafts: async () => ({ drafts: [row('a', 'PENDING'), row('b', 'CONFIRMED')] }),
      removeDraft: async ({ id }: { id: string }) => void removed.push(id),
      clearPending: async () => Promise.reject(Object.assign(new Error('x'), { code: 'UNIMPLEMENTED' })),
    }
    expect(await clearPendingDrafts(plugin)).toEqual({ removed: 1, keptSaved: 1 })
    expect(removed).toEqual(['a'])
  })
})

describe('borrado total de lo capturado', () => {
  const row = (id: string, status: string) => ({ ...valid, id, status })
  it('cuenta solo los CONFIRMED sin enviar', async () => {
    expect(await countUnsentSaved({ listDrafts: async () => ({ drafts: [row('a', 'PENDING'), row('b', 'CONFIRMED'), row('c', 'CONFIRMED')] }) })).toBe(2)
  })
  it('devuelve lo realmente borrado que informa el nativo', async () => {
    expect(await wipeCapturedAll({ clearCaptured: async () => ({ unsentRemoved: 2 }) })).toBe(2)
  })
  it('con un nativo viejo (sin respuesta) devuelve null', async () => {
    expect(await wipeCapturedAll({ clearCaptured: async () => undefined })).toBeNull()
  })
})
