import { describe, expect, it } from 'vitest'
import { randomNonce, sha256Hex } from './google'

describe('nonce de Google', () => {
  it('es largo, distinto cada vez y seguro para usar en un token', () => {
    const a = randomNonce()
    const b = randomNonce()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/)
  })
  it('sha256 en hexadecimal coincide con el valor conocido', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
