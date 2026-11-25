import { describe, expect, it } from 'vitest'
import { candidateToDraft, DEFAULT_CAPTURE_SETTINGS, decideCapture, type CaptureSettings, type ParsedCandidate } from './candidates'

const POSTED = new Date(2026, 10, 14, 12, 0, 30).getTime() // 14/11/2026, hora local

const cat = (id: string, name: string) => ({ id, name })
const CATS = [cat('c-super', 'Supermercado'), cat('c-trans', 'Transporte'), cat('c-fun', 'Salidas')]
const HISTORY = [
  { note: 'Almacen Demo Spa', category_id: 'c-super' },
  { note: 'Almacen Demo Spa', category_id: 'c-super' },
  { note: 'Almacen Demo Spa', category_id: 'c-super' },
]

const cand = (over: Partial<ParsedCandidate> = {}): ParsedCandidate => ({
  amountClp: 12_990,
  merchant: 'Almacen Demo Spa',
  kind: 'EXPENSE',
  confidence: 'HIGH',
  installment: null,
  fingerprint: 'a'.repeat(64),
  postedAtMillis: POSTED,
  ...over,
})
const OPTS = { paidBy: 'user-1', shared: true, categories: CATS, history: HISTORY }

describe('RF-07 candidateToDraft: candidato → borrador de gasto', () => {
  it('monto entero, nota = comercio, fecha del aviso, pagado por la persona', () => {
    const d = candidateToDraft(cand(), OPTS)
    expect(d).toMatchObject({ amount: 12_990, note: 'Almacen Demo Spa', spent_on: '2026-11-14', paid_by: 'user-1' })
    expect(Number.isInteger(d.amount)).toBe(true)
  })

  it('shared sigue la preferencia de la persona', () => {
    expect(candidateToDraft(cand(), { ...OPTS, shared: true }).shared).toBe(true)
    expect(candidateToDraft(cand(), { ...OPTS, shared: false }).shared).toBe(false)
  })

  it('la fecha es la del aviso, no la de hoy', () => {
    const d = candidateToDraft(cand({ postedAtMillis: new Date(2026, 0, 5, 23, 59).getTime() }), OPTS)
    expect(d.spent_on).toBe('2026-01-05')
  })

  it('sugiere la categoría con categorize.ts (aprendida del historial)', () => {
    expect(candidateToDraft(cand(), OPTS).category_id).toBe('c-super')
  })

  it('comercio conocido sin historial usa la lista fija', () => {
    expect(candidateToDraft(cand({ merchant: 'Copec Las Condes' }), { ...OPTS, history: [] }).category_id).toBe('c-trans')
  })

  it('comercio desconocido: sin categoría (no inventa)', () => {
    expect(candidateToDraft(cand({ merchant: 'Zzz Desconocido' }), { ...OPTS, history: [] }).category_id).toBeNull()
  })

  it('sin comercio: nota vacía y sin categoría', () => {
    const d = candidateToDraft(cand({ merchant: null }), OPTS)
    expect(d.note).toBe('')
    expect(d.category_id).toBeNull()
  })

  it('una cuota agrega «cuota N/M» a la nota y guarda el valor de la cuota', () => {
    const d = candidateToDraft(cand({ amountClp: 15_000, merchant: 'Prueba Electro', installment: { n: 1, total: 3 } }), OPTS)
    expect(d.amount).toBe(15_000)
    expect(d.note.startsWith('Prueba Electro')).toBe(true)
    expect(d.note).toMatch(/cuota 1\/3/i)
  })

  it('compra en cuotas: la nota dice cantidad y valor de la cuota, como la del teléfono', () => {
    const c = cand({ amountClp: 30_000, merchant: 'Prueba Electro', installmentRole: 'PURCHASE', installmentCount: 3, installmentValueClp: 10_000 })
    expect(candidateToDraft(c, OPTS).note).toBe('Prueba Electro (3 cuotas de $10.000)')
    expect(candidateToDraft({ ...c, installmentValueClp: undefined }, OPTS).note).toBe('Prueba Electro (3 cuotas)')
    expect(candidateToDraft({ ...c, installmentValueClp: 1_234_567 }, OPTS).note).toBe('Prueba Electro (3 cuotas de $1.234.567)')
    expect(candidateToDraft({ ...c, merchant: null }, OPTS).note).toBe('3 cuotas de $10.000')
  })

  it('no filtra la huella ni otros campos del candidato al borrador', () => {
    const d = candidateToDraft(cand(), OPTS)
    expect(Object.keys(d).sort()).toEqual(['amount', 'category_id', 'note', 'paid_by', 'shared', 'spent_on'])
  })
})

describe('RF-09 decideCapture: modo confirmar vs automático', () => {
  const auto: CaptureSettings = { mode: 'AUTO', maxClp: 50_000 }
  const ctx = { categories: CATS, history: HISTORY }

  it('por defecto el modo automático está apagado y el tope es 50.000', () => {
    expect(DEFAULT_CAPTURE_SETTINGS).toEqual({ mode: 'CONFIRM', maxClp: 50_000 })
  })

  it('en modo Confirmar siempre pide confirmación (CA-09-1)', () => {
    expect(decideCapture(cand(), DEFAULT_CAPTURE_SETTINGS, ctx)).toBe('ASK')
    expect(decideCapture(cand(), { mode: 'CONFIRM', maxClp: 1_000_000 }, ctx)).toBe('ASK')
  })

  it('automático: confianza alta + categoría aprendida + monto bajo el límite se guarda solo (CA-09-2)', () => {
    expect(decideCapture(cand(), auto, ctx)).toBe('AUTO_SAVE')
  })

  it('el límite es inclusivo: igual al tope se guarda, un peso más pide confirmación', () => {
    expect(decideCapture(cand({ amountClp: 50_000 }), auto, ctx)).toBe('AUTO_SAVE')
    expect(decideCapture(cand({ amountClp: 50_001 }), auto, ctx)).toBe('ASK')
  })

  it('confianza media o baja pide confirmación', () => {
    expect(decideCapture(cand({ confidence: 'MEDIUM' }), auto, ctx)).toBe('ASK')
    expect(decideCapture(cand({ confidence: 'LOW' }), auto, ctx)).toBe('ASK')
  })

  it('comercio sin categoría aprendida pide confirmación (CA-09-5)', () => {
    expect(decideCapture(cand({ merchant: 'Comercio Nuevo' }), auto, ctx)).toBe('ASK')
  })

  it('la lista fija de comercios conocidos no cuenta como aprendida', () => {
    expect(decideCapture(cand({ merchant: 'Copec Las Condes' }), auto, { categories: CATS, history: [] })).toBe('ASK')
  })

  it('si la categoría aprendida ya no existe, pide confirmación', () => {
    expect(decideCapture(cand(), auto, { categories: [cat('c-trans', 'Transporte')], history: HISTORY })).toBe('ASK')
  })

  it('sin comercio pide confirmación', () => {
    expect(decideCapture(cand({ merchant: null }), auto, ctx)).toBe('ASK')
  })

  it('un abono nunca se guarda solo (CA-09-4)', () => {
    expect(decideCapture(cand({ kind: 'INCOME' }), auto, ctx)).toBe('ASK')
  })
})
