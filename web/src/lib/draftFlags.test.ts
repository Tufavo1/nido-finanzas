import { describe, expect, it } from 'vitest'
import { duplicateMarks, sendNowNotice, syncResultNotice, wipeUnsentWarning, sourceLabel, stillUnsent, unsentCount, unsentDrafts, unsentMessage } from './draftFlags'
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
  it('un confirmado que necesita a la persona (solo una cuota, cobro de cuota anterior) no es «por enviar»', () => {
    const sinTotal = d('a', { status: 'CONFIRMED', amountClp: 10_000, installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000 })
    const previo = d('b', { status: 'CONFIRMED', installmentRole: 'PRIOR_CHARGE' })
    const conTotal = d('c', { status: 'CONFIRMED', amountClp: 30_000, installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000 })
    expect(unsentDrafts([sinTotal, previo, conTotal]).map((x) => x.id)).toEqual(['c'])
  })
  it('stillUnsent: lo que la app guarda sola ahora mismo no cuenta como no enviado', () => {
    const list = [d('a', { status: 'CONFIRMED' }), d('b', { status: 'CONFIRMED' })]
    expect(stillUnsent(list, new Set(['a'])).map((x) => x.id)).toEqual(['b'])
  })
  it('«Enviar ahora»: nunca un éxito mudo si no salió nada', () => {
    expect(sendNowNotice({ before: 1, remaining: 1, failed: false })).toBe('No se pudo enviar\nReintentaremos solos.')
    expect(sendNowNotice({ before: 2, remaining: 2, failed: true })).toBe('No se pudo enviar\nReintentaremos solos.')
    expect(sendNowNotice({ before: 2, remaining: 1, failed: false })).toBe('Se envió 1 gasto\nQueda 1 por enviar. Reintentaremos solos.')
    expect(sendNowNotice({ before: 2, remaining: 0, failed: false })).toBe('Enviado\nTus gastos ya están en tu cuenta.')
    expect(sendNowNotice({ before: 0, remaining: 0, failed: false })).toBeNull()
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

describe('syncResultNotice: el resultado real de «Enviar ahora»', () => {
  const r = (result: string, sent = 0, failed = 0, needsPerson = 0) => ({ sent, failed, needsPerson, result }) as Parameters<typeof syncResultNotice>[0]
  const o = { waiting: 1, needsSignIn: false }
  it('ALL_SENT: éxito', () => {
    expect(syncResultNotice(r('ALL_SENT', 2), o)).toEqual({ text: 'Enviado\nTus gastos ya están en tu cuenta.', tone: 'success' })
  })
  it('se envió parte: singular y plural', () => {
    expect(syncResultNotice(r('RETRY', 1, 1), o)).toEqual({ text: 'Se envió 1 gasto\nQueda 1 por enviar. Reintentaremos solos.', tone: 'warn' })
    expect(syncResultNotice(r('RETRY', 3, 2), o)).toEqual({ text: 'Se enviaron 3 gastos\nQuedan 2 por enviar. Reintentaremos solos.', tone: 'warn' })
  })
  it('NEEDS_PERSON: pide ayuda con el número', () => {
    expect(syncResultNotice(r('NEEDS_PERSON', 0, 0, 1), o)?.text).toBe('Falta tu ayuda\nHay 1 gasto que no puedo enviar solo: ábrelo y elige la categoría.')
    expect(syncResultNotice(r('NEEDS_PERSON', 0, 0, 2), o)?.text).toBe('Falta tu ayuda\nHay 2 gastos que no puedo enviar solo: ábrelos y elige la categoría.')
  })
  it('RETRY y FAILED: reintentará solo, sin códigos', () => {
    for (const x of ['RETRY', 'FAILED']) expect(syncResultNotice(r(x), o)).toEqual({ text: 'No se pudo enviar\nReintentaremos solos.', tone: 'error' })
  })
  it('NO_SESSION: pide volver a entrar solo si el estado lo indica', () => {
    expect(syncResultNotice(r('NO_SESSION'), { waiting: 1, needsSignIn: true })?.text).toBe('No se pudo enviar\nVuelve a entrar para enviar tus gastos.')
    expect(syncResultNotice(r('NO_SESSION'), o)?.text).toBe('No se pudo enviar\nReintentaremos solos.')
  })
  it('REJECTED: avisa sin texto del servidor', () => {
    expect(syncResultNotice(r('REJECTED'), o)?.text).toBe('No se pudo enviar\nAlgún gasto no fue aceptado. Ábrelo y revísalo.')
  })
  it('IN_PROGRESS: sigue enviándose y pide releer', () => {
    expect(syncResultNotice(r('IN_PROGRESS'), o)).toEqual({ text: 'Sigue enviándose\nTe avisaremos cuando llegue.', tone: 'info' })
  })
  it('NOTHING_TO_SEND con confirmados esperando es un error, no un éxito', () => {
    expect(syncResultNotice(r('NOTHING_TO_SEND'), o)).toEqual({ text: 'No encontré gastos para enviar\nAbre la bandeja e inténtalo de nuevo.', tone: 'error' })
  })
  it('NOTHING_TO_SEND sin nada esperando: no hay aviso', () => {
    expect(syncResultNotice(r('NOTHING_TO_SEND'), { waiting: 0, needsSignIn: false })).toBeNull()
  })
})

describe('wipeUnsentWarning', () => {
  it('singular, plural y nada si no hay', () => {
    expect(wipeUnsentWarning(1)).toBe('Se perderá 1 gasto guardado que aún no se envió.')
    expect(wipeUnsentWarning(3)).toBe('Se perderán 3 gastos guardados que aún no se enviaron.')
    expect(wipeUnsentWarning(0)).toBeNull()
  })
})
