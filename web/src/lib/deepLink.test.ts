import { describe, expect, it } from 'vitest'
import { parseExpenseLink } from './deepLink'

// RF-27: nido://gasto?monto=..&comercio=..&fecha=..
const NOW = new Date(2026, 10, 21) // 21 de noviembre de 2026

const ok = (url: string) => parseExpenseLink(url, NOW)
const rejected = (url: string) => {
  const r = ok(url)
  expect(r.ok, `debía rechazar: ${url}`).toBe(false)
  if (!r.ok) expect(r.reason.length).toBeGreaterThan(0)
}

describe('parseExpenseLink: enlaces válidos', () => {
  it('CA-27-1: monto y comercio', () => {
    expect(ok('nido://gasto?monto=4500&comercio=Cafe%20Demo')).toEqual({ ok: true, amountClp: 4500, merchant: 'Cafe Demo', date: null })
  })

  it('solo monto: comercio vacío (null)', () => {
    expect(ok('nido://gasto?monto=12000')).toEqual({ ok: true, amountClp: 12_000, merchant: null, date: null })
  })

  it('con fecha', () => {
    expect(ok('nido://gasto?monto=900&comercio=Kiosco&fecha=2026-11-14')).toMatchObject({ ok: true, date: '2026-11-14' })
  })

  it('acentos y ñ codificados', () => {
    expect(ok('nido://gasto?monto=3200&comercio=Panader%C3%ADa%20El%20%C3%91and%C3%BA')).toMatchObject({ ok: true, merchant: 'Panadería El Ñandú' })
  })

  it('el esquema no distingue mayúsculas y se ignoran parámetros desconocidos', () => {
    expect(ok('NIDO://gasto?monto=1000&x=1')).toMatchObject({ ok: true, amountClp: 1000 })
  })

  it('recorta espacios del comercio; uno vacío queda null', () => {
    expect(ok('nido://gasto?monto=1000&comercio=%20%20Kiosco%20%20')).toMatchObject({ merchant: 'Kiosco' })
    expect(ok('nido://gasto?monto=1000&comercio=%20%20')).toMatchObject({ ok: true, merchant: null })
  })

  it('el comercio de exactamente 60 caracteres se acepta', () => {
    expect(ok(`nido://gasto?monto=1000&comercio=${'a'.repeat(60)}`)).toMatchObject({ ok: true })
  })

  it('fecha inexistente o futura: se acepta el enlace y la fecha queda null (= hoy), como RF-02', () => {
    expect(ok('nido://gasto?monto=1000&fecha=2026-02-31')).toMatchObject({ ok: true, date: null })
    expect(ok('nido://gasto?monto=1000&fecha=2026-12-30')).toMatchObject({ ok: true, date: null })
    expect(ok('nido://gasto?monto=1000&fecha=mañana')).toMatchObject({ ok: true, date: null })
  })

  it('monto máximo permitido: 9.999.999.999', () => {
    expect(ok('nido://gasto?monto=9999999999')).toMatchObject({ ok: true, amountClp: 9_999_999_999 })
  })
})

describe('parseExpenseLink: rechazos', () => {
  it('CA-27-2: monto cero', () => rejected('nido://gasto?monto=0'))
  it('monto negativo', () => {
    rejected('nido://gasto?monto=-500')
    rejected('nido://gasto?monto=-1')
  })
  it('monto no numérico', () => {
    rejected('nido://gasto?monto=abc')
    rejected('nido://gasto?monto=12abc')
    rejected('nido://gasto?monto=1e3')
    rejected('nido://gasto?monto=0x10')
    rejected('nido://gasto?monto=Infinity')
    rejected('nido://gasto?monto=NaN')
  })
  it('monto con decimales, separadores o signos', () => {
    rejected('nido://gasto?monto=12.5')
    rejected('nido://gasto?monto=1.000')
    rejected('nido://gasto?monto=1,000')
    rejected('nido://gasto?monto=%2B500')
    rejected('nido://gasto?monto=%20')
  })
  it('monto vacío o ausente', () => {
    rejected('nido://gasto?monto=')
    rejected('nido://gasto?comercio=Kiosco')
    rejected('nido://gasto')
  })
  it('monto de 10.000.000.000 o más (límite de la columna)', () => {
    rejected('nido://gasto?monto=10000000000')
    rejected('nido://gasto?monto=99999999999999999999')
  })
  it('monto repetido (ambiguo)', () => rejected('nido://gasto?monto=100&monto=200'))
  it('esquemas ajenos', () => {
    rejected('http://gasto?monto=1000')
    rejected('https://gasto?monto=1000')
    rejected('javascript:alert(1)')
    rejected('nidox://gasto?monto=1000')
    rejected('contigo://gasto?monto=1000')
    rejected('intent://gasto?monto=1000')
    rejected('data:text/html,<script>1</script>')
  })
  it('acciones que no son «gasto»', () => {
    rejected('nido://otro?monto=1000')
    rejected('nido://borrar?monto=1000')
    rejected('nido://gasto/extra?monto=1000')
    rejected('nido://usuario@gasto?monto=1000')
  })
  it('comercio demasiado largo (más de 60 caracteres)', () => rejected(`nido://gasto?monto=1000&comercio=${'a'.repeat(61)}`))
  it('caracteres de control en el comercio', () => {
    rejected('nido://gasto?monto=1000&comercio=Kiosco%00Demo')
    rejected('nido://gasto?monto=1000&comercio=Kiosco%0ADemo')
    rejected('nido://gasto?monto=1000&comercio=Kiosco%0DDemo')
    rejected('nido://gasto?monto=1000&comercio=Kiosco%09Demo')
    rejected('nido://gasto?monto=1000&comercio=Kiosco%1BDemo')
    rejected('nido://gasto?monto=1000&comercio=Kiosco%7FDemo')
  })
  it('texto que no es un enlace', () => {
    rejected('')
    rejected('gasto?monto=1000')
    rejected('no es un enlace')
  })
})
