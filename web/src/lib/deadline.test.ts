import { describe, expect, it } from 'vitest'
import { DeadlineError, withDeadline } from './deadline'

describe('withDeadline: tope de tiempo para llamadas que pueden quedarse colgadas', () => {
  it('devuelve el resultado si llega a tiempo', async () => {
    await expect(withDeadline(Promise.resolve(7), 50)).resolves.toBe(7)
  })
  it('falla con DeadlineError si no llega a tiempo', async () => {
    const never = new Promise<number>(() => undefined)
    await expect(withDeadline(never, 10)).rejects.toBeInstanceOf(DeadlineError)
  })
  it('pasa el error original si la llamada falla antes del tope', async () => {
    await expect(withDeadline(Promise.reject(new Error('x')), 50)).rejects.toThrow('x')
  })
})
