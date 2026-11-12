/**
 * Guardar una sola vez aunque se intente varias. La app crea el identificador del registro antes de
 * enviarlo; si la red se corta y hay que reenviar, la base reconoce el mismo identificador y no lo
 * duplica. Así un gasto, un pago o un aporte nunca queda anotado dos veces por un reintento.
 */

export interface WriteResult {
  error: { message: string; code?: string } | null
  status?: number
}

/** Identificador nuevo (UUID v4) para un registro que aún no se guarda */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Navegadores antiguos (iOS anterior a 15.4)
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** La base rechazó el registro porque ese identificador ya existe: un intento anterior sí se guardó */
export const isAlreadySaved = (r: WriteResult): boolean => r.error?.code === '23505' && /_pkey\b/.test(r.error.message)

/** Falla pasajera (sin red, tiempo agotado, servidor caído): vale la pena reintentar */
export function isTransient(r: WriteResult): boolean {
  if (!r.error) return false
  if (r.status === 502 || r.status === 503 || r.status === 504) return true
  return !r.error.code && /fetch|network|timeout|abort|load failed/i.test(r.error.message)
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Ejecuta un guardado que lleva identificador propio. Reintenta las fallas pasajeras y cuenta como
 * éxito el «ya existe». `run` debe enviar siempre el mismo identificador.
 */
export async function saveOnce<R extends WriteResult>(
  run: () => PromiseLike<R>,
  o: { retries?: number; backoffMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ ok: boolean; error: R['error'] }> {
  const retries = o.retries ?? 2
  const sleep = o.sleep ?? defaultSleep
  for (let i = 0; ; i++) {
    const r = await run()
    if (!r.error || isAlreadySaved(r)) return { ok: true, error: null }
    if (!isTransient(r) || i >= retries) return { ok: false, error: r.error }
    await sleep((o.backoffMs ?? 500) * 2 ** i)
  }
}
