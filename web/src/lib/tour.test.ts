import { describe, expect, it } from 'vitest'
import { markNewsSeen, markTourSeen, newsSeen, tourSeen } from './tour'

describe('guías', () => {
  it('bienvenida y novedades se recuerdan por separado y por persona', () => {
    expect(tourSeen('u1')).toBe(false)
    markTourSeen('u1')
    expect(tourSeen('u1')).toBe(true)
    expect(newsSeen('u1')).toBe(false)
    markNewsSeen('u1')
    expect(newsSeen('u1')).toBe(true)
    expect(tourSeen('u2')).toBe(false)
  })
})
