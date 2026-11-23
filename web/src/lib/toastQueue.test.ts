import { describe, expect, it } from 'vitest'
import { createToastQueue } from './toastQueue'

// Sistema único de toasts: cola, duración, acción, deduplicación y rol accesible. Tiempos explícitos (ms).
const T0 = 1_000_000

describe('toastQueue: rol accesible', () => {
  it('error usa role=alert; éxito, aviso e información usan role=status', () => {
    const q = createToastQueue()
    q.push({ kind: 'error', message: 'No se guardó' }, T0)
    expect(q.visible()?.role).toBe('alert')
    for (const kind of ['success', 'warning', 'info'] as const) {
      const r = createToastQueue()
      r.push({ kind, message: 'Listo' }, T0)
      expect(r.visible()?.role).toBe('status')
    }
  })
})

describe('toastQueue: orden y duración', () => {
  it('muestra uno a la vez y el resto espera en orden de llegada', () => {
    const q = createToastQueue()
    const a = q.push({ kind: 'success', message: 'Uno' }, T0)
    q.push({ kind: 'info', message: 'Dos' }, T0 + 10)
    q.push({ kind: 'info', message: 'Tres' }, T0 + 20)
    expect(q.visible()?.id).toBe(a)
    expect(q.queued().map((t) => t.message)).toEqual(['Dos', 'Tres'])
  })

  it('al vencer el actual aparece el siguiente, con su propia duración desde ese momento', () => {
    const q = createToastQueue()
    q.push({ kind: 'success', message: 'Uno', durationMs: 3_000 }, T0)
    q.push({ kind: 'info', message: 'Dos', durationMs: 5_000 }, T0)
    q.tick(T0 + 2_999)
    expect(q.visible()?.message).toBe('Uno')
    q.tick(T0 + 3_000)
    expect(q.visible()?.message).toBe('Dos')
    expect(q.visible()?.expiresAt).toBe(T0 + 3_000 + 5_000)
    q.tick(T0 + 8_000)
    expect(q.visible()).toBeNull()
  })

  it('duraciones por defecto razonables: entre 3 y 10 s; los errores duran más que un éxito', () => {
    const dur = (kind: 'success' | 'error') => {
      const q = createToastQueue()
      q.push({ kind, message: 'x' }, T0)
      return q.visible()!.expiresAt - T0
    }
    expect(dur('success')).toBeGreaterThanOrEqual(3_000)
    expect(dur('error')).toBeLessThanOrEqual(10_000)
    expect(dur('error')).toBeGreaterThan(dur('success'))
  })

  it('un toast con acción dura más que el mismo sin acción', () => {
    const q1 = createToastQueue()
    q1.push({ kind: 'info', message: 'Gasto guardado' }, T0)
    const q2 = createToastQueue()
    q2.push({ kind: 'info', message: 'Gasto guardado', action: { label: 'Deshacer', id: 'undo-1' } }, T0)
    expect(q2.visible()!.expiresAt).toBeGreaterThan(q1.visible()!.expiresAt)
  })

  it('el modo Deshacer del modo automático dura al menos 10 s (CA-09-2)', () => {
    const q = createToastQueue()
    q.push({ kind: 'success', message: 'Gasto guardado', action: { label: 'Deshacer', id: 'undo-1' }, durationMs: 10_000 }, T0)
    q.tick(T0 + 9_999)
    expect(q.visible()).not.toBeNull()
    q.tick(T0 + 10_000)
    expect(q.visible()).toBeNull()
  })
})

describe('toastQueue: acciones', () => {
  it('conserva la acción Deshacer / Reintentar tal cual', () => {
    const q = createToastQueue()
    q.push({ kind: 'error', message: 'Sin conexión', action: { label: 'Reintentar', id: 'retry-send' } }, T0)
    expect(q.visible()?.action).toEqual({ label: 'Reintentar', id: 'retry-send' })
  })

  it('dismiss cierra el visible y muestra el siguiente; cerrar uno en espera lo saca de la cola', () => {
    const q = createToastQueue()
    const a = q.push({ kind: 'info', message: 'Uno' }, T0)
    const b = q.push({ kind: 'info', message: 'Dos' }, T0)
    q.push({ kind: 'info', message: 'Tres' }, T0)
    q.dismiss(b, T0 + 1)
    expect(q.queued().map((t) => t.message)).toEqual(['Tres'])
    q.dismiss(a, T0 + 2)
    expect(q.visible()?.message).toBe('Tres')
    expect(q.visible()?.expiresAt).toBeGreaterThan(T0 + 2)
  })

  it('cerrar un id inexistente no hace nada ni lanza', () => {
    const q = createToastQueue()
    q.push({ kind: 'info', message: 'Uno' }, T0)
    expect(() => q.dismiss('no-existe', T0)).not.toThrow()
    expect(q.visible()?.message).toBe('Uno')
  })
})

describe('toastQueue: deduplicación', () => {
  it('el mismo tipo y mensaje, visible o en espera, no se repite y devuelve el mismo id', () => {
    const q = createToastQueue()
    const a = q.push({ kind: 'error', message: 'Sin conexión' }, T0)
    const b = q.push({ kind: 'error', message: 'Sin conexión' }, T0 + 100)
    q.push({ kind: 'info', message: 'Otro' }, T0 + 200)
    const c = q.push({ kind: 'info', message: 'Otro' }, T0 + 300)
    expect(b).toBe(a)
    expect(q.queued()).toHaveLength(1)
    expect(q.queued()[0]!.id).toBe(c)
  })

  it('repetir el visible extiende su tiempo en pantalla', () => {
    const q = createToastQueue()
    q.push({ kind: 'error', message: 'Sin conexión' }, T0)
    const first = q.visible()!.expiresAt
    q.push({ kind: 'error', message: 'Sin conexión' }, T0 + 2_000)
    expect(q.visible()!.expiresAt).toBeGreaterThan(first)
  })

  it('mismo mensaje pero otro tipo es otro toast', () => {
    const q = createToastQueue()
    q.push({ kind: 'info', message: 'Listo' }, T0)
    q.push({ kind: 'success', message: 'Listo' }, T0)
    expect(q.queued()).toHaveLength(1)
  })

  it('pasado el vencimiento, el mismo mensaje puede volver a mostrarse', () => {
    const q = createToastQueue()
    q.push({ kind: 'info', message: 'Listo', durationMs: 3_000 }, T0)
    q.tick(T0 + 3_000)
    expect(q.visible()).toBeNull()
    q.push({ kind: 'info', message: 'Listo' }, T0 + 4_000)
    expect(q.visible()?.message).toBe('Listo')
  })
})
