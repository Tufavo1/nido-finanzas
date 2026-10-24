import { describe, expect, it } from 'vitest'
import { shouldLock } from './applock'

describe('shouldLock', () => {
  const t = 1_000_000_000
  it('no bloquea si está apagado', () => expect(shouldLock(0, t - 10 * 60_000, t)).toBe(false))
  it('no bloquea antes del plazo', () => expect(shouldLock(5, t - 4 * 60_000, t)).toBe(false))
  it('bloquea al cumplir el plazo', () => expect(shouldLock(5, t - 5 * 60_000, t)).toBe(true))
})
