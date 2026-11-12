import { describe, expect, it } from 'vitest'
import { finalAmount, initialDraft, resolveSpentOn, saveBlocker, saveLabel } from './register'
import type { Draft } from './register'

const TODAY = '2026-10-30'
const ok: Draft = { ...initialDraft('cat1', 'ana'), digits: '5000', note: 'Pan y leche' }

describe('finalAmount (R4)', () => {
  it('sin descuento paga el monto completo', () => {
    expect(finalAmount(5000, false, '')).toBe(5000)
  })
  it('aplica el porcentaje de descuento', () => {
    expect(finalAmount(10000, true, '20')).toBe(8000)
  })
  it('acepta coma decimal y redondea a peso entero', () => {
    expect(finalAmount(1000, true, '12,5')).toBe(875)
    expect(finalAmount(999, true, '10')).toBe(899)
  })
  it('un descuento mayor a 100 % nunca da monto negativo', () => {
    expect(finalAmount(1000, true, '150')).toBe(0)
  })
  it('un descuento sin escribir cuenta como 0 %', () => {
    expect(finalAmount(1000, true, '')).toBe(1000)
  })
  it('el descuento se ignora si no se marcó «con descuento»', () => {
    expect(finalAmount(1000, false, '50')).toBe(1000)
  })
})

describe('resolveSpentOn (R2, R3)', () => {
  it('sin fecha anota hoy', () => {
    expect(resolveSpentOn('', TODAY)).toBe(TODAY)
  })
  it('respeta una fecha anterior', () => {
    expect(resolveSpentOn('2026-10-02', TODAY)).toBe('2026-10-02')
  })
  it('una fecha futura se rechaza (null)', () => {
    expect(resolveSpentOn('2026-10-31', TODAY)).toBeNull()
  })
  it('hoy es válido', () => {
    expect(resolveSpentOn(TODAY, TODAY)).toBe(TODAY)
  })
})

describe('saveBlocker (R1, R2, R3, R4, R5)', () => {
  it('con todo completo no hay bloqueo', () => {
    expect(saveBlocker(ok, TODAY)).toBeNull()
  })
  it('R4: sin monto bloquea con «amount»', () => {
    expect(saveBlocker({ ...ok, digits: '' }, TODAY)).toBe('amount')
  })
  it('R1: nota vacía bloquea con «note»', () => {
    expect(saveBlocker({ ...ok, note: '' }, TODAY)).toBe('note')
  })
  it('R1: nota solo con espacios también bloquea', () => {
    expect(saveBlocker({ ...ok, note: '    ' }, TODAY)).toBe('note')
  })
  it('R2: la fecha vacía NO bloquea', () => {
    expect(saveBlocker({ ...ok, date: '' }, TODAY)).toBeNull()
  })
  it('R3: fecha futura bloquea con «date»', () => {
    expect(saveBlocker({ ...ok, date: '2027-01-01' }, TODAY)).toBe('date')
  })
  it('R5: sin categoría bloquea con «category»', () => {
    expect(saveBlocker({ ...ok, catId: '' }, TODAY)).toBe('category')
  })
  it('R4: un descuento de 100 % deja el monto en 0 y bloquea', () => {
    expect(saveBlocker({ ...ok, hasDiscount: true, discount: '100' }, TODAY)).toBe('amount')
  })
  it('el monto se revisa antes que la nota (orden de lo que se pide)', () => {
    expect(saveBlocker({ ...ok, digits: '', note: '' }, TODAY)).toBe('amount')
  })
})

describe('pagos de deuda y aportes a metas', () => {
  const bare: Draft = { ...initialDraft(undefined, 'ana'), digits: '20000' }
  it('un pago no exige categoría ni nota', () => {
    expect(saveBlocker(bare, TODAY, 'debt')).toBeNull()
    expect(saveBlocker(bare, TODAY, 'goal')).toBeNull()
  })
  it('un gasto igual sí las exige', () => {
    // Se pide en el orden de la pantalla: primero de qué fue, después la categoría
    expect(saveBlocker(bare, TODAY)).toBe('note')
    expect(saveBlocker({ ...bare, note: 'Pan' }, TODAY)).toBe('category')
  })
  it('sin monto bloquea también en un pago', () => {
    expect(saveBlocker({ ...bare, digits: '' }, TODAY, 'debt')).toBe('amount')
  })
  it('un pago ignora el descuento que quedó marcado', () => {
    expect(saveBlocker({ ...bare, hasDiscount: true, discount: '100' }, TODAY, 'debt')).toBeNull()
  })
  it('la fecha futura bloquea igual', () => {
    expect(saveBlocker({ ...bare, date: '2027-01-01' }, TODAY, 'goal')).toBe('date')
  })
  it('un pago mayor que el saldo de la deuda se bloquea con «over»', () => {
    expect(saveBlocker({ ...bare, digits: '300001' }, TODAY, 'debt', 300000)).toBe('over')
  })
  it('un pago igual al saldo vale', () => {
    expect(saveBlocker({ ...bare, digits: '300000' }, TODAY, 'debt', 300000)).toBeNull()
  })
  it('el tope solo aplica a deudas: un aporte puede pasar la meta', () => {
    expect(saveBlocker({ ...bare, digits: '999999' }, TODAY, 'goal', 1000)).toBeNull()
  })
  it('sin monto sigue ganando «amount» sobre «over»', () => {
    expect(saveBlocker({ ...bare, digits: '' }, TODAY, 'debt', 300000)).toBe('amount')
  })
  it('el botón explica por qué no deja', () => {
    expect(saveLabel('over', 0, 'debt')).toBe('Es más de lo que debes')
  })
  it('el botón dice Pagar o Aportar', () => {
    expect(saveLabel(null, 5000, 'debt')).toMatch(/^Pagar /)
    expect(saveLabel(null, 5000, 'goal')).toMatch(/^Aportar /)
  })
})

describe('saveLabel (R6)', () => {
  it('sin monto pide el monto', () => {
    expect(saveLabel('amount', 0)).toBe('Escribe el monto')
  })
  it('sin nota pide contar de qué es', () => {
    expect(saveLabel('note', 5000)).toBe('Cuenta de qué es el gasto')
  })
  it('listo muestra el monto a guardar', () => {
    expect(saveLabel(null, 5000)).toMatch(/^Guardar \$\s?5\.000$/)
  })
})

describe('initialDraft (R7)', () => {
  it('parte limpio: sin monto, sin nota, paso 1', () => {
    const d = initialDraft('cat1', 'ana')
    expect(d).toMatchObject({ digits: '', note: '', date: '', step: 1, hasDiscount: false, discount: '', shared: true, more: false, catId: 'cat1', paidBy: 'ana' })
  })
  it('cancelar = volver a initialDraft, sin arrastrar nada del borrador', () => {
    const dirty: Draft = { ...ok, step: 4, more: true, date: '2026-10-01', hasDiscount: true, discount: '10' }
    expect(initialDraft('cat1', 'ana')).not.toEqual(dirty)
    expect(initialDraft('cat1', 'ana')).toEqual(initialDraft('cat1', 'ana'))
  })
  it('sin categorías el borrador queda sin categoría elegida', () => {
    expect(initialDraft(undefined, 'ana').catId).toBe('')
  })
})

describe('saveLabel: registrar con el monto primero', () => {
  it('sin categoría reconocida pide elegirla', () => {
    expect(saveLabel('category', 5000)).toBe('Elige la categoría')
  })
  it('una fecha futura se avisa en el botón', () => {
    expect(saveLabel('date', 5000)).toBe('La fecha no puede ser futura')
  })
})
