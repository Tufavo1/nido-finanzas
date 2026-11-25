import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildAutoProfile } from './autoSync'
import { DEFAULT_CAPTURE_CONFIG, parseCaptureConfig, serializeCaptureConfig } from './captureConfig'

// Un gasto que el teléfono guarda SOLO (sin que la persona lo revise) va personal, salvo que la persona elija «Compartidos».
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const profileOf = (raw: string | null) =>
  buildAutoProfile({ userId: 'u1', householdId: 'h1', shared: parseCaptureConfig(raw).autoShared, categories: [], history: [] })

describe('gastos guardados solos: personales o compartidos', () => {
  it('por defecto se guardan como personales', () => {
    expect(DEFAULT_CAPTURE_CONFIG.autoShared).toBe(false)
    expect(profileOf(null)).toMatchObject({ shared: false, paidBy: 'u1' })
  })
  it('una preferencia antigua con shared: true (el valor por defecto de antes) no los vuelve compartidos', () => {
    const old = JSON.stringify({ mode: 'AUTO', maxClp: 50_000, shared: true, savedPackages: ['cl.banco.app'], enabled: true })
    expect(parseCaptureConfig(old).autoShared).toBe(false)
    expect(profileOf(old).shared).toBe(false)
  })
  it('solo si la persona eligió «Compartidos» se guardan compartidos, y se recuerda', () => {
    const chosen = serializeCaptureConfig({ ...DEFAULT_CAPTURE_CONFIG, autoShared: true })
    expect(parseCaptureConfig(chosen).autoShared).toBe(true)
    expect(profileOf(chosen)).toMatchObject({ shared: true, paidBy: 'u1' })
  })
  it('un valor raro vuelve a personales', () => {
    for (const v of ['si', 1, null]) expect(parseCaptureConfig(JSON.stringify({ autoShared: v })).autoShared).toBe(false)
  })
  it('el perfil que viaja al teléfono y el guardado solo de la app usan esa elección, no el «compartido» de los gastos que se revisan', () => {
    expect(src('../Shell.tsx')).toMatch(/useAutoSync\(\{[^}]*shared: capture\.autoShared/)
    expect(src('./useDetected.ts')).toMatch(/planDrafts\(drafts, config, ctx, skip\)\.auto\)[\s\S]{0,200}shared: config\.autoShared/)
  })
})
