/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// M-3: el cierre voluntario pasa por signOutClean (borra la fila de native_push_tokens con la sesión vigente).
// Solo el 401/403 (sesión ya inválida, el servidor no dejaría borrar nada) cierra directo.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('M-3: cierre de sesión limpio', () => {
  it('«Cerrar sesión» de Seguridad usa signOutClean, no signOut directo', () => {
    const src = read('../screens/Security.tsx')
    expect(src).toMatch(/signOutClean/)
    expect(src).not.toMatch(/auth\.signOut\(/)
  })
  it('App.tsx limpia salvo que el error sea 401/403', () => {
    const src = read('../App.tsx')
    expect(src).toMatch(/signOutClean/)
    expect(src).toMatch(/loadError === 401 \|\| loadError === 403/)
  })
  it('Shell.tsx solo cierra directo en 401/403 y lo explica', () => {
    const src = read('../Shell.tsx')
    expect(src).toMatch(/401 \|\| data\.errorStatus === 403 \? \(\) => void supabase\.auth\.signOut\(\)/)
    expect(src).toMatch(/sesión ya inválida/)
  })
})
