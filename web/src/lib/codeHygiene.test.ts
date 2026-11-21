/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasCopyrightHeader } from './licenses'
import { scanSource } from './codeScan'

// Higiene del código NUEVO: sin secretos, sin console.log con datos y sin localStorage para la sesión nativa.
const LIB = new URL('.', import.meta.url).pathname
const REPO = join(LIB, '../../..')

/** Módulos TypeScript nuevos de la rama móvil (los de QA y los que escriben los desarrolladores) */
const NEW_TS = ['nativeApi', 'secureSession', 'candidates', 'offlineQueue', 'deepLink', 'lockPrivacy', 'appError', 'toastQueue', 'screenState', 'securityEvents', 'licenses', 'codeScan'].map((n) => join(LIB, `${n}.ts`))

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (['build', '.gradle', '.kotlin', 'node_modules', 'test', 'resources'].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(kt|ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
/** Código de producción nuevo: módulos TS de la lista, todo native/**, y web/src/native/** si existe */
const files = [...new Set([...NEW_TS, ...walk(join(REPO, 'native')), ...walk(join(REPO, 'web/src/native'))])]

describe('scanSource: el detector funciona', () => {
  it('encuentra secretos sin devolverlos', () => {
    const v = scanSource('const a = 1\nconst k = "AKIAABCDEFGHIJKLMNOP"\n', 'x.ts')
    expect(v).toEqual([{ rule: 'secret', line: 2 }])
    expect(JSON.stringify(v)).not.toContain('AKIA')
  })
  it('reconoce JWT, claves privadas y asignaciones de contraseña o token', () => {
    expect(scanSource('const t = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.firmaDeEjemplo123"', 'x.ts')[0]?.rule).toBe('secret')
    expect(scanSource('-----BEGIN PRIVATE KEY-----', 'x.ts')[0]?.rule).toBe('secret')
    expect(scanSource('val password = "UnaClaveMuyLarga123"', 'x.kt')[0]?.rule).toBe('secret')
    expect(scanSource('const apiKey = "abcdefghijklmnop1234"', 'x.ts')[0]?.rule).toBe('secret')
  })
  it('detecta console.log/debug/info y println/Log.d con cualquier contenido', () => {
    expect(scanSource('console.log(amount)', 'x.ts')[0]).toEqual({ rule: 'console-log', line: 1 })
    expect(scanSource('console.debug(token)', 'x.ts')[0]?.rule).toBe('console-log')
    expect(scanSource('Log.d("TAG", text)', 'x.kt')[0]?.rule).toBe('console-log')
    expect(scanSource('println(text)', 'x.kt')[0]?.rule).toBe('console-log')
  })
  it('detecta localStorage y sessionStorage', () => {
    expect(scanSource('localStorage.setItem("contigo-auth", s)', 'x.ts')[0]).toEqual({ rule: 'local-storage', line: 1 })
    expect(scanSource('const s = window.sessionStorage', 'x.ts')[0]?.rule).toBe('local-storage')
  })
  it('no marca código limpio ni claves de ejemplo cortas', () => {
    expect(scanSource('export const MAX = 60\nconst password = ""\nconsole.error("fallo")\n', 'x.ts')).toEqual([])
  })
})

describe('el código nuevo de la rama móvil', () => {
  it('hay archivos que revisar', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('no contiene secretos, console.log ni localStorage', () => {
    const found = files.flatMap((f) => scanSource(readFileSync(f, 'utf8'), f).map((v) => `${f.replace(REPO + '/', '')}:${v.line} ${v.rule}`))
    expect(found).toEqual([])
  })

  it('cada archivo nuevo lleva el encabezado de copyright de Dinovance', () => {
    const sin = files.filter((f) => !hasCopyrightHeader(readFileSync(f, 'utf8'))).map((f) => f.replace(REPO + '/', ''))
    expect(sin).toEqual([])
  })
})
