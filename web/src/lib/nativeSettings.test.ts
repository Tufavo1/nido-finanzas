// Copyright (c) 2026 Dinovance
// Ajustes de la APK: estructura, textos sin jerga, estados y que la PWA no cambie.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  AMOUNT_CHOICES,
  APK_REMOVED,
  LEGACY_TO_GROUP,
  NATIVE_GROUPS,
  adaptCaptureHealth,
  amountChoices,
  captureHeadline,
  clpLabel,
  diagnosticDetail,
  joinNames,
  parseDiagnosticsDetailed,
  openBatterySettings,
  pluginErrorText,
  readCaptureHealth,
} from './nativeSettings'

const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const visible = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('estructura de los ajustes de la APK', () => {
  it('son 6 grupos como máximo, en este orden de uso', () => {
    expect(NATIVE_GROUPS.map((g) => g.title)).toEqual(['Gastos automáticos', 'Avisos', 'Seguridad', 'Mi cuenta y hogar', 'Mis datos', 'Acerca de'])
    expect(NATIVE_GROUPS.length).toBeLessThanOrEqual(6)
  })
  it('todo apartado antiguo va a un grupo que existe o queda quitado en la APK', () => {
    const ids = new Set<string>(NATIVE_GROUPS.map((g) => g.id))
    for (const [old, to] of Object.entries(LEGACY_TO_GROUP)) expect(to === 'quitado' || ids.has(to), old).toBe(true)
    expect(LEGACY_TO_GROUP['Cómo instalar Contigo']).toBe('quitado')
    expect(LEGACY_TO_GROUP['Notificaciones (web push)']).toBe('quitado')
  })
  it('Shell elige la pantalla nueva solo en la APK; la PWA sigue con Security', () => {
    const shell = src('../Shell.tsx')
    expect(shell).toMatch(/else if \(isNativeApp\(\)\) \{[^}]*body = <NativeSettings/)
    expect(shell).toMatch(/<Security /)
  })
  it('la pantalla web (Security y Profile) conserva todos sus apartados', () => {
    const s = src('../screens/Security.tsx')
    for (const t of ['Cómo instalar Contigo', 'PushToggle', 'Contraseña y sesiones', 'Verificación en dos pasos', 'Bloqueo de la app', 'Captura de gastos', 'Respaldo y exportación', 'Salir del hogar o borrar la cuenta', 'Privacidad y términos', 'Acerca de Contigo', 'Apariencia', 'Ayuda y consejos'])
      expect(s, t).toContain(t)
    const p = src('../screens/Profile.tsx')
    for (const t of ['Mi perfil financiero', 'Mi cuenta', 'Mi hogar', 'Privacidad con mi pareja']) expect(p, t).toContain(t)
  })
})

describe('lo quitado no aparece en la APK pero sí en la web', () => {
  const apk = visible('../screens/NativeSettings.tsx') + visible('../components/AutoExpenses.tsx')
  it('la APK no incluye instalar, push web ni ayudas de PWA', () => {
    expect(apk).not.toMatch(/InstallGuide|(?<!Native)PushToggle|Cómo instalar|instalar la app|pantalla de inicio|navegador|Notification\./)
    expect(apk).not.toMatch(/AccessCard|SecurityInfo|CaptureSettings|BankAutoSection/)
  })
  it('lo quitado de la APK es lo que la web sigue mostrando', () => {
    expect(APK_REMOVED.length).toBeGreaterThan(0)
    expect(src('../screens/Security.tsx')).toMatch(/PushToggle/)
    expect(src('../screens/Security.tsx')).toMatch(/InstallGuide/)
  })
  it('usa el aviso nativo y el consentimiento ya existentes', () => {
    expect(apk).toMatch(/NativePushToggle/)
    expect(apk).toMatch(/BankConsentSheet/)
    expect(apk).toMatch(/openPermissionGuide/)
  })
})

describe('textos sin jerga', () => {
  const FILES = ['../screens/NativeSettings.tsx', '../components/AutoExpenses.tsx', '../components/PartnerAlertSwitch.tsx', '../lib/nativeSettings.ts']
  it.each(FILES)('%s no usa jerga técnica', (f) => {
    // Solo texto visible: se ignoran comentarios y nombres de código
    const text = visible(f).replace(/import .*$/gm, '')
    const strings = [...text.matchAll(/'([^'\n]{6,})'|`([^`\n]{6,})`|>([^<>{}\n]{4,})</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '')
    const prose = strings.filter((s) => /\s/.test(s) && /[a-záéíóúñ]/i.test(s))
    expect(prose.length).toBeGreaterThan(0)
    for (const s of prose) expect(s, s).not.toMatch(/paquete|listener|whitelist|lista blanca|modo aprender|token|\bAPI\b|plugin|\bFCM\b|payload|\bsync\b/i)
  })
  it('las explicaciones de avisos no leídos están en español simple y todas tienen texto', () => {
    for (const c of ['NO_AMOUNT', 'INCOME', 'BANK_OFF', 'LOGIN_REQUIRED', 'ALGO_RARO', undefined]) {
      const d = diagnosticDetail(c)
      expect(d.length).toBeGreaterThan(20)
      expect(d).not.toMatch(/paquete|listener|whitelist|NO_AMOUNT|null/i)
    }
  })
})

describe('estado de Gastos automáticos', () => {
  const base = { listenerAllowed: true, enabled: true, revoked: false, activeBanks: ['Banco Falabella'], health: null }
  it('leyendo: nombra el banco en lenguaje simple', () => {
    expect(captureHeadline(base)).toEqual({ kind: 'reading', text: 'Leyendo los avisos de Banco Falabella' })
  })
  it('varios bancos se juntan con «y»; muchos se cuentan', () => {
    expect(captureHeadline({ ...base, activeBanks: ['Santander', 'Banco Estado'] }).text).toBe('Leyendo los avisos de Santander y Banco Estado')
    expect(captureHeadline({ ...base, activeBanks: ['A', 'B', 'C', 'D'] }).text).toBe('Leyendo los avisos de 4 bancos')
  })
  it('sin acceso: dice qué falta y ofrece el arreglo', () => {
    expect(captureHeadline({ ...base, listenerAllowed: false })).toEqual({ kind: 'no-access', text: 'Falta activar el acceso', action: { type: 'access', label: 'Activar el acceso' } })
  })
  it('si el acceso se quitó después, lo dice distinto', () => {
    expect(captureHeadline({ ...base, listenerAllowed: false, revoked: true }).text).toMatch(/Se quitó el acceso/)
  })
  it('en pausa: ofrece reanudar', () => {
    expect(captureHeadline({ ...base, enabled: false })).toMatchObject({ kind: 'paused', action: { type: 'resume', label: 'Reanudar' } })
  })
  it('acceso listo pero ningún banco encendido', () => {
    const h = captureHeadline({ ...base, activeBanks: [] })
    expect(h.kind).toBe('idle')
    expect(h.text).toMatch(/Enciende un banco/)
  })
  it('la salud del teléfono, si existe, avisa que Android dejó de entregar avisos', () => {
    expect(captureHeadline({ ...base, health: { state: 'stalled' } })).toMatchObject({ kind: 'stalled', action: { type: 'reconnect' } }) // Migrado: ahora «Reconectar» (relee los avisos y pide el reenganche), no la guía de permisos
    expect(captureHeadline({ ...base, health: { state: 'ok' } }).kind).toBe('reading')
    expect(captureHeadline({ ...base, health: { state: 'no-access' } }).kind).toBe('no-access')
  })
})

describe('adaptador tolerante de getCaptureHealth', () => {
  it('entiende estados conocidos y descarta lo raro', () => {
    expect(adaptCaptureHealth({ state: 'OK' })).toEqual({ state: 'ok' })
    expect(adaptCaptureHealth({ state: 'NO_ACCESS' })).toEqual({ state: 'no-access' })
    expect(adaptCaptureHealth({ state: 'DISCONNECTED' })).toEqual({ state: 'stalled' })
    expect(adaptCaptureHealth({ state: 'quien-sabe' })).toBeNull()
    expect(adaptCaptureHealth(null)).toBeNull()
    expect(adaptCaptureHealth('x')).toBeNull()
  })
  it('si el método no existe, falla o devuelve basura, cae a null sin lanzar', async () => {
    expect(await readCaptureHealth({})).toBeNull()
    expect(await readCaptureHealth({ getCaptureHealth: () => Promise.reject(new Error('x')) })).toBeNull()
    expect(await readCaptureHealth({ getCaptureHealth: () => { throw new Error('sync') } })).toBeNull()
    expect(await readCaptureHealth({ getCaptureHealth: async () => ({ state: 'OK' }) })).toEqual({ state: 'ok' })
  })
})

describe('avisos que no pude leer', () => {
  it('cada aviso trae motivo, explicación y texto para copiar', () => {
    const r = parseDiagnosticsDetailed({ items: [{ reason: 'INCOME', maskedText: 'Abono **** 12', at: 5 }, { reason: 'NO_AMOUNT', at: 6 }, 7] })
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ reason: 'Parece un abono', masked: 'Abono **** 12' })
    expect(r[0]!.detail).toMatch(/abono/i)
    expect(r[1]!.masked).toBeNull()
  })
  it('basura no rompe', () => expect(parseDiagnosticsDetailed(undefined)).toEqual([]))
})

describe('monto para guardar solo', () => {
  it('ofrece montos listos y siempre incluye el actual', () => {
    expect(amountChoices(50_000)).toEqual([...AMOUNT_CHOICES])
    expect(amountChoices(75_000)).toEqual([20_000, 50_000, 75_000, 100_000, 200_000])
  })
  it('formatea en pesos chilenos', () => expect(clpLabel(50_000)).toBe('$50.000'))
  it('joinNames', () => {
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B y C')
  })
})

describe('salud real del teléfono (getCaptureHealth)', () => {
  const base = { listenerAllowed: true, enabled: true, revoked: false, activeBanks: ['Santander'] }
  it('adapta los cinco estados y las horas', () => {
    expect(adaptCaptureHealth({ state: 'BATTERY_RESTRICTED', listenerAllowed: true, connected: true })).toEqual({ state: 'battery' })
    expect(adaptCaptureHealth({ state: 'CONNECTING' })).toEqual({ state: 'connecting' })
    expect(adaptCaptureHealth({ state: 'DISCONNECTED', disconnectedHours: 5.7, sinceUpdate: true })).toEqual({ state: 'stalled', hours: 5, sinceUpdate: true })
    expect(adaptCaptureHealth({ state: 'DISCONNECTED', disconnectedHours: null, sinceUpdate: false })).toEqual({ state: 'stalled' })
  })
  it('batería: texto simple y botón a los ajustes de batería', () => {
    expect(captureHeadline({ ...base, health: { state: 'battery' } })).toEqual({ kind: 'battery', text: 'El teléfono puede cerrar Contigo para ahorrar batería', action: { type: 'battery', label: 'Abrir ajustes de batería' } })
  })
  it('conectando: sin alarma ni botón', () => {
    expect(captureHeadline({ ...base, health: { state: 'connecting' } })).toEqual({ kind: 'connecting', text: 'Conectando…' })
  })
  it('desconectado: horas, «Reconectar» y la nota si fue tras actualizar', () => {
    expect(captureHeadline({ ...base, health: { state: 'stalled', hours: 5, sinceUpdate: true } })).toEqual({
      kind: 'stalled',
      text: 'Contigo dejó de recibir avisos hace 5 horas',
      note: 'Pasa a veces después de actualizar.',
      action: { type: 'reconnect', label: 'Reconectar' },
    })
    expect(captureHeadline({ ...base, health: { state: 'stalled', hours: 1 } }).text).toBe('Contigo dejó de recibir avisos hace 1 hora')
    expect(captureHeadline({ ...base, health: { state: 'stalled' } }).note).toBeUndefined()
  })
  it('sin acceso gana a todo y en pausa gana a la salud', () => {
    expect(captureHeadline({ ...base, listenerAllowed: false, health: { state: 'battery' } }).kind).toBe('no-access')
    expect(captureHeadline({ ...base, enabled: false, health: { state: 'stalled' } }).kind).toBe('paused')
  })
  it('abrir batería usa el método propio o cae a la ficha de la app', async () => {
    const calls: string[] = []
    await openBatterySettings({ openBatterySettings: async () => void calls.push('bat'), openAppDetails: async () => void calls.push('app') })
    await openBatterySettings({ openAppDetails: async () => void calls.push('app') })
    expect(calls).toEqual(['bat', 'app'])
  })
})

describe('avisos no leídos: frase por pista', () => {
  it('cada pista tiene frase simple y cae al motivo si no existe', () => {
    const r = parseDiagnosticsDetailed({
      items: [
        { reason: 'NO_AMOUNT', hint: 'NO_AMOUNT_IN_TITLE_OR_TEXT', shape: { title: 3 }, fields: ['title'], at: 1 },
        { reason: 'NO_AMOUNT', hint: 'EMPTY', at: 2 },
        { reason: 'NO_AMOUNT', hint: 'ONLY_TITLE', at: 3 },
        { reason: 'NO_AMOUNT', hint: 'ONLY_EXTRA_FIELDS', at: 4 },
        { reason: 'NO_AMOUNT', hint: null, at: 5 },
        { reason: 'NO_AMOUNT', hint: 'PISTA_NUEVA', at: 6 },
      ],
    })
    expect(r[0]!.detail).toBe('El aviso llegó sin monto en el título ni en el texto.')
    expect(new Set(r.slice(0, 4).map((x) => x.detail)).size).toBe(4)
    expect(r[4]!.detail).toBe(diagnosticDetail('NO_AMOUNT'))
    expect(r[5]!.detail).toBe(diagnosticDetail('NO_AMOUNT'))
    for (const x of r) expect(x.detail).not.toMatch(/[A-Z]{3,}_[A-Z]|shape|fields/)
  })
})

describe('errores nuevos del teléfono', () => {
  it('RESERVED_KEY y STORE_FAILED dan texto simple sin el código', () => {
    for (const code of ['RESERVED_KEY', 'STORE_FAILED']) {
      const t = pluginErrorText({ code, message: code })!
      expect(t).toMatch(/No se pudo guardar de forma segura en este teléfono/)
      expect(t).toMatch(/Reinicia Contigo/)
      expect(t).not.toMatch(/RESERVED|STORE_FAILED/)
    }
    expect(pluginErrorText({ code: 'OTRO' })).toBeNull()
    expect(pluginErrorText(null)).toBeNull()
  })
  it('las pantallas usan el texto simple en lugar de mostrar el error', () => {
    expect(src('../components/AutoExpenses.tsx')).toMatch(/pluginErrorText\(e\)/)
    expect(src('../components/BankConsentSheet.tsx')).toMatch(/pluginErrorText\(e\)/)
  })
})

describe('avisos no leídos: un texto propio por motivo', () => {
  const REASONS_UI = ['NO_AMOUNT', 'INCOME', 'BANK_OFF', 'LOGIN_REQUIRED', 'FOREIGN_CURRENCY', 'STALE_DATE', 'LOW_CONFIDENCE', 'DUPLICATE', 'QUEUE_FULL', 'CAP_EXCEEDED', 'CATEGORY_UNKNOWN', 'NOTIFICATIONS_OFF', 'PACKAGE_NOT_ALLOWED']
  it('compra en dólares: dice que es otra moneda y qué hacer, aunque el teléfono mande la pista «sin monto»', () => {
    const [r] = parseDiagnosticsDetailed({ items: [{ reason: 'FOREIGN_CURRENCY', hint: 'NO_AMOUNT_IN_TITLE_OR_TEXT', maskedText: 'Compra US$ ##,## en ****', at: 1 }] })
    expect(r!.reason).toBe('Compra en otra moneda')
    expect(r!.detail).toBe('Es una compra en otra moneda (por ejemplo dólares). Anótala tú con el monto en pesos que cobró tu banco.')
    expect(r!.detail).not.toMatch(/sin monto/)
  })
  it('cada motivo tiene título y explicación distintos, en español simple y sin código', () => {
    const titles = new Set<string>()
    const details = new Set<string>()
    for (const code of REASONS_UI) {
      const [r] = parseDiagnosticsDetailed({ items: [{ reason: code, at: 1 }] })
      expect(r!.reason, code).not.toBe('No pude leerlo')
      expect(r!.detail, code).not.toBe(diagnosticDetail('ALGO_RARO'))
      expect(r!.detail, code).not.toMatch(/[A-Z]{3,}_[A-Z]|paquete|listener|plugin/)
      titles.add(r!.reason)
      details.add(r!.detail)
    }
    expect(titles.size).toBe(REASONS_UI.length)
    expect(details.size).toBe(REASONS_UI.length)
  })
  it('la pista solo aplica cuando el motivo es «sin monto»', () => {
    const [r] = parseDiagnosticsDetailed({ items: [{ reason: 'INCOME', hint: 'EMPTY', at: 1 }] })
    expect(r!.detail).toBe(diagnosticDetail('INCOME'))
  })
})
