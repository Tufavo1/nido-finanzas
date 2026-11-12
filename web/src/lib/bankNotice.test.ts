import { describe, expect, it } from 'vitest'
import { parseBankNotice, readSharedNotice } from './bankNotice'

const NOW = new Date(2026, 10, 11) // 11 de noviembre de 2026

describe('parseBankNotice: leer el aviso de una compra', () => {
  it('compra con débito: monto, comercio y fecha', () => {
    const n = parseBankNotice('Compra por $12.990 en LIDER EXPRESS con tu Tarjeta de Débito terminada en 1234 el 10/11/2026 a las 18:32.', NOW)
    expect(n).toEqual({ kind: 'expense', amount: 12_990, merchant: 'Lider Express', date: '2026-11-10' })
  })

  it('compra con crédito escrita de otra forma', () => {
    const n = parseBankNotice('Banco de Chile: Se realizó una compra con su tarjeta de crédito ****5678 por $45.000 en COPEC LAS CONDES el 09/11/2026 14:05', NOW)
    expect(n).toEqual({ kind: 'expense', amount: 45_000, merchant: 'Copec Las Condes', date: '2026-11-09' })
  })

  it('montos de millones y sin fecha (queda para hoy)', () => {
    const n = parseBankNotice('Pagaste $1.250.000 en Falabella', NOW)
    expect(n).toEqual({ kind: 'expense', amount: 1_250_000, merchant: 'Falabella', date: null })
  })

  it('una transferencia enviada es un gasto a nombre de quien la recibe', () => {
    const n = parseBankNotice('Transferencia realizada a Juan Pérez por $20.000', NOW)
    expect(n).toEqual({ kind: 'expense', amount: 20_000, merchant: 'Juan Pérez', date: null })
  })

  it('acepta el monto escrito como CLP o en pesos, y sin puntos', () => {
    expect(parseBankNotice('Compra aprobada por CLP 8.500 en Starbucks', NOW)).toMatchObject({ amount: 8_500, merchant: 'Starbucks' })
    expect(parseBankNotice('Compra de 3500 pesos en Kiosko', NOW)).toMatchObject({ amount: 3_500, merchant: 'Kiosko' })
  })

  it('ignora los centavos', () => {
    expect(parseBankNotice('Compra por $4.990,00 en Farmacia Ahumada', NOW)).toMatchObject({ amount: 4_990 })
  })

  it('si no reconoce el comercio igual entrega el monto', () => {
    expect(parseBankNotice('Cargo tarjeta $7.000', NOW)).toEqual({ kind: 'expense', amount: 7_000, merchant: '', date: null })
  })

  it('fecha con guiones o sin año', () => {
    expect(parseBankNotice('Compra por $1.000 en Metro el 05-11-2026', NOW)).toMatchObject({ date: '2026-11-05' })
    expect(parseBankNotice('Compra por $1.000 en Metro el 05/11', NOW)).toMatchObject({ date: '2026-11-05' })
  })

  it('una fecha futura o que no existe se descarta', () => {
    expect(parseBankNotice('Compra por $1.000 en Metro el 30/12/2026', NOW)).toMatchObject({ date: null })
    expect(parseBankNotice('Compra por $1.000 en Metro el 31/02/2026', NOW)).toMatchObject({ date: null })
  })

  it('el comercio nunca pasa de 60 letras', () => {
    const n = parseBankNotice(`Compra por $1.000 en ${'A'.repeat(200)}`, NOW)
    expect(n?.kind === 'expense' && n.merchant.length).toBe(60)
  })
})

describe('parseBankNotice: lo que no es un gasto', () => {
  it('plata que entra no se anota como gasto', () => {
    for (const t of [
      'Recibiste una transferencia de María por $50.000',
      'Abono de remuneraciones por $900.000',
      'Te han depositado $30.000 en tu cuenta',
      'Devolución por $5.990 de MercadoLibre',
    ]) {
      expect(parseBankNotice(t, NOW), t).toEqual({ kind: 'income' })
    }
  })

  it('avisos sin monto no dicen nada', () => {
    expect(parseBankNotice('Tu clave dinámica es 123456. No la compartas.', NOW)).toBeNull()
    expect(parseBankNotice('', NOW)).toBeNull()
  })

  it('compras en otra moneda no se anotan solas (la app es en pesos)', () => {
    expect(parseBankNotice('Compra por US$25,00 en AMAZON', NOW)).toBeNull()
    expect(parseBankNotice('Compra por USD 25.00 en AMAZON', NOW)).toBeNull()
  })

  it('un monto de $0 no es un gasto', () => {
    expect(parseBankNotice('Compra por $0 en Prueba', NOW)).toBeNull()
  })
})

describe('readSharedNotice: texto que llega al abrir la app desde otra app', () => {
  it('lee el texto compartido (Android) de la dirección', () => {
    expect(readSharedNotice('?text=Compra%20por%20%2412.990%20en%20Lider', '')).toBe('Compra por $12.990 en Lider')
  })
  it('junta título y texto', () => {
    expect(readSharedNotice('?title=Banco&text=Compra+por+%241.000', '')).toBe('Banco Compra por $1.000')
  })
  it('también desde la parte que nunca sale del teléfono (#)', () => {
    expect(readSharedNotice('', '#text=Pagaste%20%243.500%20en%20Metro')).toBe('Pagaste $3.500 en Metro')
  })
  it('sin texto no hay nada', () => {
    expect(readSharedNotice('?tab=add', '')).toBeNull()
    expect(readSharedNotice('?text=%20%20', '')).toBeNull()
  })
  it('corta textos enormes', () => {
    expect(readSharedNotice(`?text=${'a'.repeat(5000)}`, '')?.length).toBe(1000)
  })
})
