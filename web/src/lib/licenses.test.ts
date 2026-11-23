/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkLicenses, hasCopyrightHeader, inventoryFromLock, thirdPartyNotice, type DependencyEntry } from './licenses'

// Estándares, Seguridad: inventario (SBOM) con licencia, rechazo de incompatibles y encabezado de copyright.
const dep = (name: string, license: string, version = '1.0.0'): DependencyEntry => ({ name, version, license })

describe('checkLicenses', () => {
  it('permite licencias permisivas comunes', () => {
    const r = checkLicenses(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0'].map((l) => dep(`p-${l}`, l)))
    expect(r.rejected).toEqual([])
    expect(r.unknown).toEqual([])
    expect(r.allowed).toHaveLength(9)
  })

  it('rechaza copyleft fuerte, de red y no comercial', () => {
    const r = checkLicenses(['GPL-3.0-only', 'GPL-2.0-or-later', 'AGPL-3.0-only', 'SSPL-1.0', 'CC-BY-NC-4.0', 'UNLICENSED'].map((l) => dep(`p-${l}`, l)))
    expect(r.rejected).toHaveLength(6)
    expect(r.allowed).toEqual([])
  })

  it('una expresión con OR se permite si alguna opción es permitida', () => {
    expect(checkLicenses([dep('a', '(MIT OR GPL-3.0-only)')]).allowed).toHaveLength(1)
  })

  it('una expresión con AND exige que todas lo sean', () => {
    const r = checkLicenses([dep('a', '(MIT AND GPL-3.0-only)'), dep('b', '(MIT AND ISC)')])
    expect(r.rejected.map((d) => d.name)).toEqual(['a'])
    expect(r.allowed.map((d) => d.name)).toEqual(['b'])
  })

  it('sin licencia o no reconocida va a «revisar», no se aprueba en silencio', () => {
    const r = checkLicenses([dep('a', ''), dep('b', 'SEE LICENSE IN LICENSE.txt'), dep('c', 'Licencia-Inventada-9')])
    expect(r.unknown.map((d) => d.name)).toEqual(['a', 'b', 'c'])
    expect(r.allowed).toEqual([])
  })

  it('no distingue mayúsculas en el identificador y no pierde dependencias', () => {
    const inv = [dep('a', 'mit'), dep('b', 'gpl-3.0-only'), dep('c', '')]
    const r = checkLicenses(inv)
    expect(r.allowed.length + r.rejected.length + r.unknown.length).toBe(inv.length)
    expect(r.allowed[0]?.name).toBe('a')
    expect(r.rejected[0]?.name).toBe('b')
  })
})

describe('inventoryFromLock', () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'contigo', version: '0.0.0' },
      'node_modules/react': { version: '19.0.0', license: 'MIT' },
      'node_modules/@scope/pkg': { version: '2.1.0', license: 'Apache-2.0' },
      'node_modules/a/node_modules/b': { version: '0.3.0' },
    },
  }
  it('lista cada paquete con nombre, versión y licencia, sin el paquete raíz', () => {
    expect(inventoryFromLock(lock)).toEqual([
      { name: 'react', version: '19.0.0', license: 'MIT' },
      { name: '@scope/pkg', version: '2.1.0', license: 'Apache-2.0' },
      { name: 'b', version: '0.3.0', license: '' },
    ])
  })
  it('entrada vacía o inválida: lista vacía, sin lanzar', () => {
    expect(inventoryFromLock({})).toEqual([])
    expect(inventoryFromLock(null)).toEqual([])
  })

  it('las dependencias reales del repo (web/package-lock.json) no traen licencias rechazadas', () => {
    const real = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'))
    const inv = inventoryFromLock(real)
    expect(inv.length).toBeGreaterThan(50)
    const r = checkLicenses(inv)
    expect(r.rejected.map((d) => `${d.name}@${d.version} ${d.license}`)).toEqual([])
  })
})

describe('thirdPartyNotice', () => {
  it('genera el aviso con nombre, versión y licencia, ordenado por nombre', () => {
    const t = thirdPartyNotice([dep('zeta', 'MIT', '1.2.3'), dep('alfa', 'ISC', '0.1.0')])
    expect(t.indexOf('alfa')).toBeGreaterThanOrEqual(0)
    expect(t.indexOf('alfa')).toBeLessThan(t.indexOf('zeta'))
    expect(t).toContain('zeta@1.2.3')
    expect(t).toContain('ISC')
  })
})

describe('hasCopyrightHeader', () => {
  it('reconoce «Copyright (c) 2026 Dinovance» y «© 2026 Dinovance» al inicio', () => {
    expect(hasCopyrightHeader('/**\n * Copyright (c) 2026 Dinovance\n */\nexport {}')).toBe(true)
    expect(hasCopyrightHeader('// © 2026 Dinovance\nexport {}')).toBe(true)
    expect(hasCopyrightHeader('/* Copyright (C) 2026 Dinovance. Todos los derechos reservados. */')).toBe(true)
  })
  it('lo rechaza si falta, si es de otra empresa o si está lejos del inicio', () => {
    expect(hasCopyrightHeader('export const x = 1')).toBe(false)
    expect(hasCopyrightHeader('// Copyright (c) 2026 Otra Empresa')).toBe(false)
    expect(hasCopyrightHeader('\n'.repeat(20) + '// © 2026 Dinovance')).toBe(false)
  })
})
