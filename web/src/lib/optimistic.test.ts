import { describe, expect, it } from 'vitest'
import { runOptimistic } from './optimistic'

describe('runOptimistic', () => {
  it('aplica el cambio al instante y lo deja si el servidor acepta', async () => {
    const log: string[] = []
    const r = await runOptimistic(() => log.push('apply'), async () => void log.push('commit'), () => log.push('revert'))
    expect(r).toEqual({ ok: true })
    expect(log).toEqual(['apply', 'commit'])
  })
  it('si el servidor rechaza, revierte y devuelve el error original', async () => {
    const log: string[] = []
    const boom = new Error('rechazado')
    const r = await runOptimistic(() => log.push('apply'), () => Promise.reject(boom), () => log.push('revert'))
    expect(r).toEqual({ ok: false, error: boom })
    expect(log).toEqual(['apply', 'revert'])
  })
})
