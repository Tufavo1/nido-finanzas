import { describe, expect, it } from 'vitest'
import { ANNOUNCE_NEWS, markNewsSeen, markTourSeen, newsSeen, tourSeen } from './tour'

describe('guías', () => {
  it('las novedades no salen solas salvo que se activen a propósito', () => expect(ANNOUNCE_NEWS).toBe(false))
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
