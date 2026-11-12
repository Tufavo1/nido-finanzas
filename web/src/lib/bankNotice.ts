/**
 * Lee el aviso de una compra que manda el banco (notificación, SMS o correo) y saca lo que sirve para
 * anotar el gasto: cuánto, dónde y cuándo. Todo ocurre en el teléfono: el texto no se envía a ningún lado.
 *
 * La app es una PWA y no puede leer sola las notificaciones de otras apps (ni en iOS ni en Android),
 * así que el texto llega de tres formas: pegado en «Registrar», compartido desde otra app (Android) o
 * en la dirección con que una automatización abre la app (ver readSharedNotice).
 */

export type BankNotice =
  | { kind: 'expense'; amount: number; /** Comercio o persona; vacío si no se reconoce */ merchant: string; /** AAAA-MM-DD; null = hoy */ date: string | null }
  /** Plata que entró (abono, depósito, devolución): no es un gasto */
  | { kind: 'income' }

const MAX_MERCHANT = 60
const NUM = '(\\d{1,3}(?:\\.\\d{3})+|\\d+)'
const AMOUNT = new RegExp(`\\$\\s*${NUM}(?:,\\d{1,2})?|\\bCLP\\s*${NUM}(?:,\\d{1,2})?|\\b${NUM}(?:,\\d{1,2})?\\s*pesos\\b`, 'i')
const FOREIGN = /US\$|\bUSD\b|\bEUR\b|€|\bUF\b/i
const INCOME = /\brecibiste\b|\babono\b|\bdeposit(ado|aron)\b|\bte (han |ha )?(transferido|transfirieron|depositado)\b|\btransferencia recibida\b|\bdevoluci[oó]n\b|\breverso\b|\breembolso\b/i
/** Dónde termina el nombre del comercio */
const STOP = /\s+(?:el\s+\d|con\s+(?:tu|su)\b|a\s+las\b|desde\b|terminada\b|por\b)|\s+\d{1,2}[/-]\d{1,2}|[.,;:](?:\s|$)|\n/i
const DATE = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?(?![\d/-])/

const pad = (n: number) => String(n).padStart(2, '0')

function cleanMerchant(raw: string): string {
  let m = raw.replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim()
  // «LIDER EXPRESS» se lee mejor como «Lider Express»
  if (m && m === m.toUpperCase() && /\p{L}/u.test(m)) m = m.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
  return m.slice(0, MAX_MERCHANT)
}

function findMerchant(before: string, after: string, text: string): string {
  const here = /(?:^|\s)en\s+(.+)/is.exec(after)
  if (here) {
    const rest = here[1]!
    const cut = STOP.exec(rest)
    const name = cleanMerchant(cut ? rest.slice(0, cut.index) : rest)
    // «en tu cuenta», «en 3 cuotas»: no es un comercio
    if (name && !/^(\d|tu\b|su\b|cuotas?\b)/i.test(name)) return name
  }
  // «Transferencia realizada a Juan Pérez por $20.000»
  if (/transfer/i.test(text)) {
    const to = /\ba\s+(?!las\b)(.+?)\s+por\s*$/i.exec(before.trimEnd() + ' ')
    if (to) return cleanMerchant(to[1]!)
  }
  return ''
}

function findDate(text: string, now: Date): string | null {
  const m = DATE.exec(text)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const build = (y: number) => {
    const date = new Date(y, mo - 1, d)
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d && date <= today ? date : null
  }
  // Sin año: este año, o el pasado si la fecha aún no llega (un aviso de diciembre leído en enero)
  const date = m[3] ? build(Number(m[3])) : (build(now.getFullYear()) ?? build(now.getFullYear() - 1))
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : null
}

/** null si el texto no trae un monto en pesos que se pueda anotar */
export function parseBankNotice(text: string, now: Date): BankNotice | null {
  const t = text.trim()
  if (!t || FOREIGN.test(t)) return null
  const m = AMOUNT.exec(t)
  if (!m) return null
  const amount = Number((m[1] ?? m[2] ?? m[3] ?? '').replace(/\./g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (INCOME.test(t)) return { kind: 'income' }
  const before = t.slice(0, m.index)
  const after = t.slice(m.index + m[0].length)
  return { kind: 'expense', amount, merchant: findMerchant(before, after, t), date: findDate(t, now) }
}

const MAX_SHARED = 1000

/**
 * Texto con que otra app abrió Contigo: «?text=…» (compartir en Android) o «#text=…» (automatizaciones;
 * lo que va después de # no sale del teléfono). null si no viene nada.
 */
export function readSharedNotice(search: string, hash: string): string | null {
  for (const raw of [hash.replace(/^#/, ''), search]) {
    const p = new URLSearchParams(raw)
    const text = [p.get('title'), p.get('text')].filter((x): x is string => !!x && x.trim() !== '').join(' ').trim()
    if (text) return text.slice(0, MAX_SHARED)
  }
  return null
}
