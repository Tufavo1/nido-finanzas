import { describe, expect, it } from 'vitest'
import { duplicateMarks, sourceLabel, unsentCount, unsentDrafts, unsentMessage } from './draftFlags'
import type { NativeDraft } from './nativeBridge'

const d = (id: string, o: Partial<NativeDraft> & { possibleDuplicate?: boolean } = {}): NativeDraft & { possibleDuplicate?: boolean } => ({
  id, amountClp: 6_500, merchant: 'Cafe Demo Norte', kind: 'EXPENSE', confidence: 'HIGH', installment: null, fingerprint: id, postedAtMillis: 1, createdAtMillis: 1, status: 'PENDING', ...o,
})

describe('duplicateMarks (H-04)', () => {
  it('marca como posible duplicado al segundo borrador con el mismo monto y comercio; el primero no', () => {
    const marks = duplicateMarks([d('a', { createdAtMillis: 1 }), d('b', { createdAtMillis: 2 })])
    expect(marks.get('a')).toBeUndefined()
    expect(marks.get('b')).toBe('a')
  })
  it('no distingue mayúsculas ni espacios sobrantes en el comercio', () => {
    expect(duplicateMarks([d('a'), d('b', { merchant: '  cafe demo norte ', createdAtMillis: 2 })]).get('b')).toBe('a')
  })
  it('montos o comercios distintos no se marcan', () => {
    expect(duplicateMarks([d('a'), d('b', { amountClp: 6_600, createdAtMillis: 2 }), d('c', { merchant: 'Otro', createdAtMillis: 3 })]).size).toBe(0)
  })
  it('respeta la marca que ponga el teléfono, aunque no haya otro igual a la vista', () => {
    expect(duplicateMarks([d('a', { possibleDuplicate: true })]).has('a')).toBe(true)
  })
})

describe('unsentDrafts y mensaje (H-05)', () => {
  it('solo cuentan los gastos ya confirmados con «Guardar» en la notificación', () => {
    expect(unsentDrafts([d('a', { status: 'CONFIRMED' }), d('b'), d('c', { status: 'CONFIRMED' })]).map((x) => x.id)).toEqual(['a', 'c'])
  })
  it('el aviso habla en singular y plural', () => {
    expect(unsentMessage(1)).toBe('Tienes 1 gasto por enviar')
    expect(unsentMessage(3)).toBe('Tienes 3 gastos por enviar')
  })
})

describe('sourceLabel', () => {
  it('usa el nombre visible de la app si se conoce y, si no, el paquete', () => {
    expect(sourceLabel('cl.banco.app', new Map([['cl.banco.app', 'Banco Demo']]))).toBe('Banco Demo')
    expect(sourceLabel('cl.otro.app', new Map())).toBe('cl.otro.app')
  })
})

describe('unsentCount: el número del plugin reemplaza al cálculo local', () => {
  it('con el número del plugin y algo que atender, se usa ese número', () => {
    expect(unsentCount(5, 2)).toBe(5)
  })
  it('sin número del plugin se usa el cálculo local', () => {
    expect(unsentCount(null, 2)).toBe(2)
  })
  it('si nada necesita atención (todo se guarda solo) no se avisa', () => {
    expect(unsentCount(5, 0)).toBe(0)
  })
})
