// Copyright (c) 2026 Dinovance
/// <reference types="node" />
// QA ronda 3: carrera al cambiar de cuenta, privacidad del registro automatico y logica de destinatarios del gasto mayor.
// Etiqueta ROJO = defecto que existe hoy. Datos sinteticos.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { splitRecipients, bigSpendBody, BIG_SPEND_TITLE } from '../../../supabase/functions/notify/recipients'

// ---- Telefono simulado: ejecuta las llamadas en el ORDEN en que la WebView las emite (el plugin las serializa) ----
const native = vi.hoisted(() => {
  const s = { owner: undefined as string | null | undefined, profile: null as { ownerKey: string } | null, calls: [] as string[], gates: [] as (() => void)[] }
  // Cada llamada se aplica al telefono en el momento de emitirse, pero su respuesta llega despues (latencia del puente)
  const later = <T>(v: T) => new Promise<T>((res) => s.gates.push(() => res(v)))
  const api = {
    configureSync: () => later(undefined),
    setActiveOwner: (o: { ownerKey: string | null }) => { s.calls.push(`owner:${o.ownerKey}`); s.owner = o.ownerKey; return later(undefined) },
    wipeForAccountSwitch: (o: { ownerKey: string | null }) => { s.calls.push('wipeSwitch'); s.profile = null; s.owner = o.ownerKey; return later(undefined) },
    setAutoProfile: (p: { ownerKey: string }) => { s.calls.push(`profile:${p.ownerKey}`); s.profile = { ownerKey: p.ownerKey }; return later(undefined) },
    secureRemove: () => later(undefined),
  }
  return { s, api }
})
vi.mock('./nativeBridge', async (orig) => ({ ...(await orig<typeof import('./nativeBridge')>()), isNativeApp: () => true, ContigoNative: native.api }))

// useEffect sin DOM: se juntan los efectos y se ejecutan a mano
const fx = vi.hoisted(() => ({ list: [] as (() => void | (() => void))[] }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useEffect: (f: () => void | (() => void)) => void fx.list.push(f) }))
vi.mock('./safeLog', () => ({ logError: () => undefined }))

import { useAutoSync } from './useAutoSync'
import { wipeForAccountSwitch } from './wipe'

const U1 = '11111111-1111-4111-8111-111111111111'
const H1 = '22222222-2222-4222-8222-222222222222'
const base = { householdId: H1, shared: true, categories: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Comida' }], history: [{ note: 'Cafe Demo Norte', category_id: '33333333-3333-4333-8333-333333333333' }], ready: true }

const flushBridge = async () => { for (let i = 0; i < 5; i++) { native.s.gates.splice(0).forEach((g) => g()); await Promise.resolve(); await Promise.resolve() } }

describe('r3-2 carrera al cambiar de cuenta (useAutoSync + wipeForAccountSwitch + setActiveOwner)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); native.s.owner = undefined; native.s.profile = null; native.s.calls = []; native.s.gates = []; fx.list = [] })

  it('flujo normal: el dueno se fija ANTES del perfil y el perfil es del dueno activo', async () => {
    useAutoSync({ userId: U1, ...base })
    fx.list.forEach((f) => f())
    vi.runAllTimers(); await flushBridge()
    expect(native.s.calls).toEqual([`owner:${U1}:${H1}`, `profile:${U1}:${H1}`])
  })

  it('ROJO: si entra otra persona mientras el dueno anterior esta en vuelo, el perfil del anterior NO debe quedar guardado', async () => {
    useAutoSync({ userId: U1, ...base })
    fx.list.forEach((f) => f())
    vi.runAllTimers() // sale setActiveOwner(A); su respuesta todavia no llega
    wipeForAccountSwitch() // la app detecto otra cuenta: el telefono borra perfil y dueno
    await flushBridge() // llega la respuesta de A y la cadena emite setAutoProfile(A) DESPUES del borrado
    // Correccion de la sesion principal: lo seguro es que setAutoProfile del dueno anterior NO se emita tras el borrado.
    expect(native.s.calls).toEqual([`owner:${U1}:${H1}`, 'wipeSwitch'])
    expect(native.s.profile, 'el perfil (comercios aprendidos) de la persona anterior sobrevive al cambio de cuenta y a la ventana sin dueno').toBeNull()
  })

  it('ROJO: tras el cambio el telefono no puede quedar con dueno nulo y perfil de otra persona (guardaria/enviaria bajo el dueno equivocado)', async () => {
    useAutoSync({ userId: U1, ...base })
    fx.list.forEach((f) => f())
    vi.runAllTimers()
    wipeForAccountSwitch()
    await flushBridge()
    const consistent = native.s.profile === null || native.s.profile.ownerKey === native.s.owner
    expect(consistent).toBe(true)
  })
})

// ---------------------------------------------------------------- Privacidad (lectura de fuentes nuevas)
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const NEW_FILES = ['./autoSync.ts', './bankAuto.ts', './useAutoSync.ts', './partnerAlerts.ts', '../components/BankAutoSection.tsx', '../components/BankCard.tsx', '../components/PartnerAlerts.tsx', '../components/SyncStatus.tsx']

describe('r3-6 privacidad del codigo nuevo', () => {
  it.each(NEW_FILES)('%s no usa console ni mete montos o comercios en errores', (f) => {
    const t = src(f)
    expect(t).not.toMatch(/console\.(log|info|warn|error|debug)/)
    expect(t).not.toMatch(/new Error\(`[^`]*\$\{/)
    expect(t).not.toMatch(/localStorage|sessionStorage/)
  })

  it('useDetected solo registra la clase del error (logError(e, pantalla)), nunca montos ni notas', () => {
    const t = src('./useDetected.ts')
    for (const m of t.matchAll(/logError\(([^)]*)\)/g)) expect(m[1]).toMatch(/^e, 'useDetected'$/)
  })

  it('el perfil enviado al telefono solo lleva categorias por clave de comercio: nunca el texto del aviso ni notas completas', () => {
    const t = src('./autoSync.ts')
    expect(t).not.toMatch(/\.note\b.*profile|rawText|body/i)
  })
})

describe('r3-5 notify: el aviso no filtra comercio ni texto bruto', () => {
  const idx = src('../../../supabase/functions/notify/index.ts')
  it('el gasto se lee SIN nota ni comercio y el cuerpo solo usa monto y categoria', () => {
    expect(idx).toMatch(/\.from\('expenses'\)\s*\.select\('amount, shared, category_id, created_by, created_at, notified_at'\)/)
    expect(bigSpendBody('$60.000', 'Comida', true)).toBe('$60.000 en Comida')
    expect(bigSpendBody('$60.000', 'Comida', false)).toBe('$60.000 en Comida (personal)')
    expect(idx).not.toMatch(/body = .*\bnote\b/)
  })
  it('quien registra el gasto nunca es destinatario (neq uid) y sale quien dejo el hogar', () => {
    expect(idx).toMatch(/\.neq\('user_id', uid\)/)
    expect(idx).toMatch(/\.is\('left_at', null\)/)
  })
  it('si la lectura de preferencias falla (migracion ausente) todos reciben el aviso normal', () => {
    expect(idx).toMatch(/if \(!prefsErr\)/)
  })
  it('el titulo de gasto mayor es generico: no nombra comercio', () => {
    expect(BIG_SPEND_TITLE).toBe('Tu pareja hizo un gasto mayor')
  })
})

describe('r3-5 splitRecipients: bordes adversariales', () => {
  const p = (user_id: string, enabled: unknown, threshold_clp: number | string) => ({ user_id, enabled: enabled as boolean, threshold_clp })
  it('enabled que no es true estricto (texto, 1) no activa el aviso', () => {
    expect(splitRecipients(['a'], [p('a', 'true', 10)], 99).major).toEqual([])
    expect(splitRecipients(['a'], [p('a', 1, 10)], 99).major).toEqual([])
  })
  it('umbral negativo, cero, vacio, Infinity y monto Infinity: aviso normal', () => {
    for (const t of [-1, 0, '', ' ', 'Infinity', '-5']) expect(splitRecipients(['a'], [p('a', true, t)], 1e6).major).toEqual([])
    expect(splitRecipients(['a'], [p('a', true, 10)], Infinity).major).toEqual([])
    expect(splitRecipients(['a'], [p('a', true, 10)], -50).major).toEqual([])
  })
  it('borde exacto del umbral y umbral gigante', () => {
    expect(splitRecipients(['a'], [p('a', true, 50_000)], 50_000).major).toEqual(['a'])
    expect(splitRecipients(['a'], [p('a', true, 50_001)], 50_000).major).toEqual([])
    expect(splitRecipients(['a'], [p('a', true, 9_999_999_999)], 9_999_999_998).major).toEqual([])
  })
  it('ambos activados con umbrales distintos y un tercero sin preferencia: cada uno en su grupo, sin repetir', () => {
    const r = splitRecipients(['a', 'b', 'c', 'a'], [p('a', true, 1), p('b', true, 70_000)], 60_000)
    expect(r).toEqual({ major: ['a'], normal: ['b', 'c'] })
  })
  it('ids hostiles (__proto__, constructor) no rompen el Map ni se cuelan en el grupo mayor', () => {
    const r = splitRecipients(['__proto__', 'constructor'], [p('a', true, 1)], 1e6)
    expect(r).toEqual({ major: [], normal: ['__proto__', 'constructor'] })
  })
  it('el creador del gasto, si llegara a la lista, solo se excluye aguas arriba: la funcion pura no lo sabe (documentado)', () => {
    expect(splitRecipients(['creador'], [p('creador', true, 1)], 10).major).toEqual(['creador'])
  })
})
