// Copyright (c) 2026 Dinovance
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseBankNotice } from './bankNotice'

// QA ronda 2 (TypeScript): paridad con el parser Kotlin y cierre del camino de cola de H-02.
const NOW = new Date(2026, 10, 21)
const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('R2-09 montos con decimales de estilo extranjero (paridad con Kotlin)', () => {
  it.each(['Compra por $12,99 en TIENDA DEMO', 'Compra por $12.99 en TIENDA DEMO', 'Compra por $12,5 en TIENDA DEMO'])('«%s» no se anota como 12 pesos', (text) => {
    const n = parseBankNotice(text, NOW)
    expect(n === null || (n.kind === 'expense' && n.amount !== 12)).toBe(true)
  })
})

describe('R2-10 comercio que empieza con dígito', () => {
  it.each([
    ['Compra por $12.990 en 7-ELEVEN DEMO', '7-Eleven Demo'],
    ['Compra por $8.990 en 3B DEMO SPA', '3b Demo Spa'],
  ])('«%s»', (text, merchant) => {
    const n = parseBankNotice(text, NOW)
    expect(n && n.kind === 'expense' ? n.merchant.toLowerCase() : null).toBe(merchant.toLowerCase())
  })
})

describe('R2-11 evidencia (debe pasar)', () => {
  it('formatos de monto válidos', () => {
    expect(parseBankNotice('Compra por $12.990,50 en TIENDA DEMO', NOW)).toMatchObject({ kind: 'expense', amount: 12_990 })
    expect(parseBankNotice('Compra por $12 990 en TIENDA DEMO', NOW)).toMatchObject({ kind: 'expense', amount: 12_990 })
    expect(parseBankNotice('Compra por USD 12,99 en SHOP DEMO', NOW)).toBeNull()
  })
  it('el camino de guardado sin red pasa el id del gasto a la cola (H-02 cerrado)', () => {
    expect(src('./useDetected.ts')).toMatch(/enqueueWithNotice\(queue, \{ \.\.\.form, id \}/)
    expect(src('../screens/Register.tsx')).toMatch(/enqueueWithNotice\(queue, \{ \.\.\.form, id \}/)
  })
  it('cerrar sesión y cambiar de cuenta llaman al plugin nativo', () => {
    const s = src('./wipe.ts')
    expect(s).toMatch(/ContigoNative\.wipe\(\)/)
    expect(s).toMatch(/wipeForAccountSwitch/)
  })
})
