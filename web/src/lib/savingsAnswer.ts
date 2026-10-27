/**
 * «¿Guardaste ahorro este mes?». El «sí» no se guarda: se ve en los aportes a metas del mes.
 * Solo se recuerda el «no», en este dispositivo, para no volver a preguntar ese mes.
 */

const keyFor = (userId: string, monthKey: string) => `nido:sin-ahorro:${userId}:${monthKey}`

export function saidNoSavings(userId: string, monthKey: string): boolean {
  try {
    return localStorage.getItem(keyFor(userId, monthKey)) === '1'
  } catch {
    return false
  }
}

export function setSaidNoSavings(userId: string, monthKey: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(keyFor(userId, monthKey), '1')
    else localStorage.removeItem(keyFor(userId, monthKey))
  } catch {
    /* sin almacenamiento: se vuelve a preguntar */
  }
}
