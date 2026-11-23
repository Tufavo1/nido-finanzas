// Copyright (c) 2026 Dinovance

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Hash de 53 bits (cyrb53) con semilla: determinista y sin APIs asíncronas. No es criptográfico; solo reparte. */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

const hex = (n: number, width: number) => (n % 16 ** width).toString(16).padStart(width, '0')

/**
 * Id del gasto que sale de un borrador del teléfono. Es DETERMINISTA (mismo borrador, mismo id, también
 * después de reiniciar la app), así reenviar tras un corte nunca duplica el gasto: la base reconoce el id (23505 = éxito).
 * Los borradores nativos ya traen un UUID v4: se usa tal cual. Cualquier otro texto se convierte en un UUID estable.
 */
export function draftExpenseId(nativeDraftId: string): string {
  if (UUID.test(nativeDraftId)) return nativeDraftId.toLowerCase()
  const parts = [0, 1, 2, 3].map((seed) => cyrb53(nativeDraftId, seed))
  const variant = (8 + (parts[3]! % 4)).toString(16)
  return `${hex(parts[0]!, 8)}-${hex(parts[1]!, 4)}-4${hex(parts[1]! >>> 4, 3)}-${variant}${hex(parts[2]!, 3)}-${hex(parts[2]! >>> 8, 6)}${hex(parts[3]!, 6)}`
}
