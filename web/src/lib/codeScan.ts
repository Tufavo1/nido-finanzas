// Copyright (c) 2026 Dinovance
// Higiene del código nuevo. Los patrones se escriben de modo que este archivo no se marque a sí mismo.

export type ViolationRule = 'secret' | 'console-log' | 'local-storage'
export interface Violation {
  rule: ViolationRule
  /** Numero de linea (desde 1) */
  line: number
}

const RULES: [ViolationRule, RegExp][] = [
  [
    'secret',
    /AKIA[0-9A-Z]{16}|eyJ[\w-]{5,}\.eyJ[\w-]{5,}\.[\w-]{5,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  ],
  ['console-log', /\bconsole\s*\.\s*(?:log|debug|info)\s*\(|\bprintln\s*\(|\bLog\s*\.\s*[dvi]\s*\(/],
  ['local-storage', /\b(?:local|session)Storage\b/],
]

/** Revisa el texto de un archivo de codigo nuevo (TS o Kotlin). Nunca devuelve el secreto encontrado. */
export function scanSource(source: string, _path: string): Violation[] {
  const found: Violation[] = []
  source.split('\n').forEach((text, i) => {
    for (const [rule, re] of RULES) if (re.test(text)) found.push({ rule, line: i + 1 })
  })
  return found
}
