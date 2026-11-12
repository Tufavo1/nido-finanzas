/** Fecha de nacimiento: se pide para confirmar la mayoría de edad y ajustar los consejos a la etapa de vida. Es privada. */

export const MIN_AGE = 18
export const MAX_AGE = 110

/** Por qué se pide: el texto que acompaña al campo */
export const BIRTH_WHY = 'La necesitamos para confirmar que eres mayor de edad y darte consejos según tu etapa de vida. Solo tú la ves.'

/** Años cumplidos a la fecha `now`; null si la fecha no existe o está mal escrita */
export function ageOn(birth: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  let age = now.getFullYear() - y
  if (now.getMonth() < mo - 1 || (now.getMonth() === mo - 1 && now.getDate() < d)) age--
  return age
}

/** Qué impide aceptar la fecha; null si está bien */
export function birthError(birth: string, now: Date): string | null {
  if (!birth) return 'Escribe tu fecha de nacimiento'
  const age = ageOn(birth, now)
  if (age === null) return 'Esa fecha no existe'
  if (age < 0) return 'La fecha no puede ser futura'
  if (age < MIN_AGE) return `Contigo es para personas mayores de ${MIN_AGE} años`
  if (age > MAX_AGE) return 'Revisa el año de nacimiento'
  return null
}

/** Consejo según la edad; null si no hay nada especial que decir */
export function lifeStageTip(age: number): string | null {
  if (age < 30) return 'Empezar a ahorrar joven rinde más: aunque sea poco, hazlo todos los meses.'
  if (age >= 50) return 'Conviene llegar a la jubilación sin deudas: dale prioridad a pagarlas.'
  return null
}
