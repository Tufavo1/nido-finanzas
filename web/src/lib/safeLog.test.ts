import { describe, expect, it } from 'vitest'
import { createSafeLogger } from './safeLog'
import type { ClientErrorReport } from './clientReport'

const SECRET = Object.assign(new Error('insert falló: ($12.990, Almacen Demo) token=abc123'), { details: 'Key (amount)=(12990)', code: '23502' })

function setup(now = 1_000) {
  const logged: unknown[][] = []
  const sent: ClientErrorReport[] = []
  const t = { now }
  const logger = createSafeLogger({
    log: (...a) => void logged.push(a),
    send: async (r) => void sent.push(r),
    source: 'android',
    appVersion: '1.2.0',
    now: () => t.now,
  })
  return { logger, logged, sent, t }
}

describe('createSafeLogger (H-12)', () => {
  it('registra solo el tipo de error, nunca el mensaje, los detalles ni los datos', () => {
    const { logger, logged } = setup()
    logger.error(SECRET, 'bandeja')
    const text = JSON.stringify(logged)
    expect(text).not.toMatch(/12\.990|12990|Almacen|token|abc123|Key \(/)
    expect(logged).toHaveLength(1)
  })

  it('reporta al servidor un código tipado y la pantalla, sin datos personales', async () => {
    const { logger, sent } = setup()
    logger.error(SECRET, 'bandeja')
    await Promise.resolve()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ p_source: 'android', p_app_version: '1.2.0', p_screen: 'bandeja' })
    expect(JSON.stringify(sent[0])).not.toMatch(/12\.990|12990|Almacen|token|abc123/)
  })

  it('el mismo tipo de error en la misma pantalla no se reporta de nuevo dentro de un minuto', async () => {
    const { logger, sent, t } = setup()
    logger.error(SECRET, 'bandeja')
    logger.error(SECRET, 'bandeja')
    t.now += 59_000
    logger.error(SECRET, 'bandeja')
    t.now += 2_000
    logger.error(SECRET, 'bandeja')
    await Promise.resolve()
    expect(sent).toHaveLength(2)
  })

  it('si el envío falla no lanza ni hace ruido con datos', async () => {
    const logged: unknown[][] = []
    const logger = createSafeLogger({ log: (...a) => void logged.push(a), send: async () => Promise.reject(SECRET), source: 'web', appVersion: '1', now: () => 1 })
    expect(() => logger.error(SECRET)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(JSON.stringify(logged)).not.toMatch(/12\.990|Almacen|abc123/)
  })
})
