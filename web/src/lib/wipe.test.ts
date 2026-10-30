import { afterEach, describe, expect, it, vi } from 'vitest'
import { wipeSessionData } from './wipe'

function fakeStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init))
  return {
    get length() {
      return m.size
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    keys: () => [...m.keys()].sort(),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('wipeSessionData', () => {
  it('borra lo personal y conserva las preferencias del aparato', () => {
    const ls = fakeStorage({
      'contigo-notify-log': '[]',
      'contigo-seen-alerts': '[]',
      'contigo-alert-snooze': '{}',
      'contigo-locked': '1',
      'contigo-lock-throttle': '{}',
      'nido:sin-ahorro:u:2026-10': '1',
      'contigo-theme': 'dark',
      'contigo-lock-min': '5',
      'nido-tour-v1:u': '1',
    })
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('sessionStorage', fakeStorage({ x: '1' }))
    wipeSessionData()
    expect(ls.keys()).toEqual(['contigo-lock-min', 'contigo-theme', 'nido-tour-v1:u'])
  })
})
