// Copyright (c) 2026 Dinovance
// Inventario de dependencias (SBOM) con su licencia, rechazo de las incompatibles y aviso de terceros.

export interface DependencyEntry {
  name: string
  version: string
  /** Expresion SPDX ("MIT", "(MIT OR Apache-2.0)"); vacio si no declara */
  license: string
}
export interface LicenseReport {
  allowed: DependencyEntry[]
  /** Licencia no permitida (copyleft fuerte, no comercial, sin licencia de uso) */
  rejected: DependencyEntry[]
  /** Sin licencia declarada o no reconocida: requiere revision humana */
  unknown: DependencyEntry[]
}

const PERMISSIVE = new Set(
  ['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'CC-BY-4.0', 'Python-2.0', 'MIT-0', 'Zlib', 'WTFPL'].map((l) => l.toLowerCase()),
)
const FORBIDDEN = /^(?:a?gpl|sspl|cc-by-nc|unlicensed|busl|elastic|commons-clause)/i

type Verdict = 'allowed' | 'rejected' | 'unknown'

function idVerdict(id: string): Verdict {
  const clean = id.replace(/\+$/, '')
  if (PERMISSIVE.has(clean.toLowerCase())) return 'allowed'
  return FORBIDDEN.test(clean) ? 'rejected' : 'unknown'
}

/** Evalúa una expresión SPDX: AND pesa más que OR; WITH (excepción) se ignora; si no se entiende, 'unknown'. */
function expressionVerdict(expr: string): Verdict {
  const tokens = expr.match(/\(|\)|[^\s()]+/g) ?? []
  let pos = 0
  const peek = () => tokens[pos]?.toUpperCase()

  const atom = (): Verdict => {
    const t = tokens[pos++]
    if (t === undefined || t === ')' || t.toUpperCase() === 'AND' || t.toUpperCase() === 'OR') throw new Error('expresion')
    if (t === '(') {
      const v = or()
      if (tokens[pos++] !== ')') throw new Error('expresion')
      return v
    }
    if (peek() === 'WITH') pos += 2
    return idVerdict(t)
  }
  const and = (): Verdict => {
    let v = atom()
    while (peek() === 'AND') {
      pos++
      const r = atom()
      v = v === 'rejected' || r === 'rejected' ? 'rejected' : v === 'unknown' || r === 'unknown' ? 'unknown' : 'allowed'
    }
    return v
  }
  function or(): Verdict {
    let v = and()
    while (peek() === 'OR') {
      pos++
      const r = and()
      v = v === 'allowed' || r === 'allowed' ? 'allowed' : v === 'unknown' || r === 'unknown' ? 'unknown' : 'rejected'
    }
    return v
  }

  try {
    const v = or()
    return pos === tokens.length ? v : 'unknown'
  } catch {
    // Una expresión mal formada no se aprueba en silencio: queda para revisión humana
    return 'unknown'
  }
}

export function checkLicenses(inventory: DependencyEntry[]): LicenseReport {
  const report: LicenseReport = { allowed: [], rejected: [], unknown: [] }
  for (const d of inventory) report[d.license.trim() ? expressionVerdict(d.license) : 'unknown'].push(d)
  return report
}

interface LockPackage {
  version?: unknown
  license?: unknown
  link?: unknown
}

const NM = 'node_modules/'

/** Inventario a partir del contenido de package-lock.json (lockfileVersion 2/3); omite el paquete raiz */
export function inventoryFromLock(lock: unknown): DependencyEntry[] {
  const packages = (lock as { packages?: Record<string, LockPackage> } | null)?.packages
  if (!packages || typeof packages !== 'object') return []
  const out: DependencyEntry[] = []
  for (const [path, p] of Object.entries(packages)) {
    const at = path.lastIndexOf(NM)
    if (at < 0 || !p || p.link === true || typeof p.version !== 'string') continue
    out.push({ name: path.slice(at + NM.length), version: p.version, license: typeof p.license === 'string' ? p.license : '' })
  }
  return out
}

/** Texto del archivo de avisos de terceros (nombre, version, licencia), ordenado por nombre */
export function thirdPartyNotice(inventory: DependencyEntry[]): string {
  const seen = new Map<string, DependencyEntry>()
  for (const d of inventory) seen.set(`${d.name}@${d.version}`, d)
  const lines = [...seen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, d]) => `${key} — ${d.license || 'licencia no declarada'}`)
  return ['Avisos de software de terceros usado en Contigo', '', ...lines, ''].join('\n')
}

const HEADER_LINES = 10
const HEADER = /(?:copyright\s*\(c\)|©)\s*2026\s+dinovance/i

/** ¿Las primeras lineas traen «Copyright (c) 2026 Dinovance» o «© 2026 Dinovance»? */
export function hasCopyrightHeader(source: string): boolean {
  return HEADER.test(source.split('\n', HEADER_LINES).join('\n'))
}
