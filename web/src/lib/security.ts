/** Fuerza de contraseña de 0 a 4. Pide largo y variedad, y descarta las más obvias. */
export function passwordStrength(pw: string): number {
  if (pw.length < 10) return pw.length > 0 ? 1 : 0
  const common = /^(1234567890|password\d*|contrase[ñn]a\d*|qwertyuiop|0123456789)$/i
  if (common.test(pw) || /^(.)\1+$/.test(pw)) return 1
  let score = 2
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  if (kinds >= 3) score++
  if (pw.length >= 14 && kinds >= 2) score++
  return Math.min(score, 4)
}

export const STRENGTH_LABEL = ['', 'Muy débil', 'Aceptable', 'Buena', 'Excelente']

/**
 * Freno local contra intentos repetidos: tras 5 fallos espera 30 s, y se duplica.
 * Con `storeKey` el conteo se guarda en el dispositivo: recargar la página o abrir otra pestaña no lo reinicia.
 */
export function createThrottle(max = 5, baseMs = 30000, storeKey?: string) {
  let fails = 0
  let until = 0
  const load = () => {
    if (!storeKey) return
    try {
      const v = JSON.parse(localStorage.getItem(storeKey) ?? 'null') as { fails?: unknown; until?: unknown } | null
      fails = typeof v?.fails === 'number' && v.fails > 0 ? Math.min(v.fails, 1000) : 0
      until = typeof v?.until === 'number' ? v.until : 0
    } catch {
      /* sin almacenamiento: queda solo en memoria */
    }
  }
  const save = () => {
    if (!storeKey) return
    try {
      if (fails === 0) localStorage.removeItem(storeKey)
      else localStorage.setItem(storeKey, JSON.stringify({ fails, until }))
    } catch {
      /* sin almacenamiento: queda solo en memoria */
    }
  }
  return {
    remaining(): number {
      load()
      return Math.max(0, Math.ceil((until - Date.now()) / 1000))
    },
    fail(): void {
      load()
      fails++
      if (fails >= max) until = Date.now() + baseMs * 2 ** Math.min(fails - max, 5)
      save()
    },
    reset(): void {
      fails = 0
      until = 0
      save()
    },
  }
}

/** Lo que se lee de un error de Supabase (auth o PostgREST) para traducirlo; nunca se muestra tal cual */
export interface ErrorLike {
  message?: string
  code?: string
}

/** Primero manda el código del error (estable); el texto solo se mira si no hay código conocido */
const CODE_TEXT: Record<string, string> = {
  weak_password: 'Esa contraseña es muy débil. Usa al menos 10 caracteres, con letras y números.',
  same_password: 'La contraseña nueva debe ser distinta de la actual.',
  over_request_rate_limit: 'Demasiados intentos. Espera un momento y vuelve a probar.',
  over_email_send_rate_limit: 'Demasiados intentos. Espera un momento y vuelve a probar.',
  email_exists: 'Ese correo ya está en uso.',
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_address_invalid: 'Ese correo no es válido.',
  reauthentication_needed: 'Por seguridad, vuelve a entrar para hacer este cambio.',
}

/** Traduce errores técnicos de Supabase a frases claras. Acepta el error entero (con su código) o solo el texto. */
export function friendlyError(err: ErrorLike | string): string {
  const { message = '', code } = typeof err === 'string' ? { message: err, code: undefined } : err
  if (code && CODE_TEXT[code]) return CODE_TEXT[code]
  const m = message.toLowerCase()
  // Las funciones del servidor responden en español: se reconocen y se devuelve nuestro propio texto
  if (m.includes('código inválido')) return 'Código inválido, vencido o ya utilizado. Pide uno nuevo a tu pareja.'
  if (m.includes('ya perteneces')) return 'Ya perteneces a un hogar.'
  if (m.includes('demasiados intentos')) return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  if (m.includes('invalid') && m.includes('code')) return 'Ese código no es válido o ya fue usado.'
  if (m.includes('already') && m.includes('member')) return 'Ya perteneces a un hogar.'
  if (m.includes('household') && m.includes('full')) return 'Ese hogar ya está completo.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  if (m.includes('network') || m.includes('fetch')) return 'Sin conexión. Revisa tu internet e intenta de nuevo.'
  if (m.includes('weak') || m.includes('should be at least')) return CODE_TEXT.weak_password!
  return 'Algo salió mal. Intenta de nuevo.'
}
