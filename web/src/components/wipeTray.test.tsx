// Copyright (c) 2026 Dinovance
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WipeTrayView } from './WipeTray'
import { countDrafts, wipeTrayQuestion } from '../lib/wipeTray'

const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const noop = () => undefined
const view = (count: number, armed: boolean) => renderToStaticMarkup(<WipeTrayView count={count} saved={0} armed={armed} onArm={noop} onCancel={noop} onConfirm={noop} />)

describe('Vaciar movimientos pendientes: siempre pide confirmar', () => {
  it('la pregunta lleva el número real y el plural correcto', () => {
    expect(wipeTrayQuestion(1)).toBe('¿Vaciar la bandeja? Se borrará 1 movimiento pendiente. No se puede deshacer.')
    expect(wipeTrayQuestion(7)).toBe('¿Vaciar la bandeja? Se borrarán 7 movimientos pendientes. No se puede deshacer.')
  })
  it('si hay guardados sin enviar, la pregunta lo dice y aclara que no se pierden', () => {
    expect(wipeTrayQuestion(2, 1)).toBe('¿Vaciar la bandeja? Se borrarán 2 movimientos pendientes. Hay 1 gasto guardado que aún no se envía: no se pierde. No se puede deshacer.')
    expect(wipeTrayQuestion(1, 3)).toBe('¿Vaciar la bandeja? Se borrará 1 movimiento pendiente. Hay 3 gastos guardados que aún no se envían: no se pierden. No se puede deshacer.')
  })
  it('la tarjeta muestra los guardados sin enviar aunque no haya pendientes', () => {
    const h = renderToStaticMarkup(<WipeTrayView count={0} saved={2} armed={false} onArm={noop} onCancel={noop} onConfirm={noop} />)
    expect(h).toBe('')
  })
  it('sin pendientes no aparece', () => {
    expect(view(0, false)).toBe('')
    expect(view(0, true)).toBe('')
  })
  it('primer toque: solo el botón con rótulo propio, sin la pregunta', () => {
    const h = view(3, false)
    expect(h).toContain('Vaciar movimientos pendientes')
    expect(h).not.toContain('No se puede deshacer')
    expect(h.match(/<button/g)).toHaveLength(1)
  })
  it('armado: pregunta con el número, confirmar y cancelar', () => {
    const h = view(3, true)
    expect(h).toContain('Se borrarán 3 movimientos pendientes. No se puede deshacer.')
    expect(h).toContain('Toca otra vez para vaciar')
    expect(h).toContain('Cancelar')
    expect(h).toContain('role="alert"')
  })
  it('AutoExpenses solo borra desde la confirmación y cuenta lo pendiente', () => {
    const t = src('./AutoExpenses.tsx')
    expect(t).toContain('<WipeTray')
    expect(t).not.toContain('setConfirmWipe')
    expect(t).not.toContain('clearCaptured(')
    expect(t.match(/clearPendingDrafts\(/g)).toHaveLength(1)
  })
  it('queda separada de «Borrar todos» (otro rótulo y espacio de al menos 16 px)', () => {
    expect(src('./ClearAllNotices.tsx')).toContain('Borrar todos')
    expect(src('./WipeTray.tsx')).not.toContain('Borrar todos')
    expect(src('../styles.css').replace(/\s+/g, ' ')).toMatch(/\.wipe-tray \{[^}]*margin-top: (1[6-9]|[2-9]\d)px/)
  })
})

describe('CaptureSettings: «Borrar lo capturado» es total y avisa lo que se pierde', () => {
  it('cuenta los guardados antes, usa wipeCapturedAll y no el vaciado parcial', () => {
    const t = src('./CaptureSettings.tsx')
    expect(t).toContain('countUnsentSaved(')
    expect(t).toContain('wipeCapturedAll(')
    expect(t).toContain('wipeUnsentWarning(')
    expect(t).not.toContain('clearPendingDrafts(')
  })
})

describe('Vaciar movimientos pendientes: el conteo de guardados es el de ese momento', () => {
  it('2 pendientes + 1 confirmado sin enviar: la pregunta trae la frase en singular', () => {
    const c = countDrafts([{ status: 'PENDING' }, { status: 'PENDING' }, { status: 'CONFIRMED' }])
    expect(c).toEqual({ pending: 2, saved: 1 })
    expect(wipeTrayQuestion(c.pending, c.saved)).toContain('Hay 1 gasto guardado que aún no se envía: no se pierde.')
  })
  it('2 confirmados: plural', () => {
    const c = countDrafts([{ status: 'PENDING' }, { status: 'CONFIRMED' }, { status: 'CONFIRMED' }])
    expect(wipeTrayQuestion(c.pending, c.saved)).toContain('Hay 2 gastos guardados que aún no se envían: no se pierden.')
  })
  it('WipeTray relee la bandeja al tocar el primer botón, y AutoExpenses al volver a primer plano y con draftsChanged', () => {
    const wipe = src('./WipeTray.tsx')
    expect(wipe).toMatch(/onBeforeArm/)
    expect(wipe).toMatch(/await onBeforeArm/)
    const auto = src('./AutoExpenses.tsx')
    expect(auto).toMatch(/useAppResume\(/)
    expect(auto).toMatch(/addListener\('draftsChanged'/)
    expect(auto).toMatch(/onBeforeArm=\{/)
  })
})
