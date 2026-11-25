// Copyright (c) 2026 Dinovance
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Ring from './Ring'

describe('porcentajes con espacio antes del %', () => {
  it('el anillo de Metas dice «0 %», «10 %» y «100 %»', () => {
    for (const p of [0, 10, 100]) expect(renderToStaticMarkup(<Ring pct={p} />)).toContain(`>${p} %<`)
  })
  it('el anillo no se parte en dos líneas', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.ring-label\s*\{[^}]*white-space:\s*nowrap/)
  })
  it('ningún texto visible de src deja un número pegado al % (`{n}%` en JSX o plantillas)', () => {
    const files: string[] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = `${d}/${f}`
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p)
      }
    }
    walk(new URL('..', import.meta.url).pathname)
    const bad = files.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .flatMap((l, i) => (/\}%(?![)\w;'"])|\{pct\}%/.test(l) && !/style=|--w|transform|left:|width|translate/.test(l) ? [`${f}:${i + 1}`] : []),
      ),
    )
    expect(bad).toEqual([])
  })
})
