import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Nadie se desplaza hacia abajo: «Crear» y «Más opciones» deben verse sin scroll,
// antes del teclado y del botón guardar. No hay DOM: se fija el orden en el JSX y el CSS.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const register = read('./Register.tsx')
const css = read('../styles.css')
const at = (needle: string) => {
  const i = register.indexOf(needle)
  expect(i, `no está: ${needle}`).toBeGreaterThan(-1)
  return i
}

describe('Registrar: accesos visibles sin desplazarse', () => {
  it('«Crear» está en el encabezado, antes del selector, el teclado y guardar', () => {
    const crear = at('aria-label="Crear otra cosa"')
    expect(crear).toBeGreaterThan(at('className="reg-nav"'))
    expect(crear).toBeLessThan(at('aria-label="Qué vas a registrar"'))
    expect(crear).toBeLessThan(at('className="keypad reg-keys"'))
    expect(crear).toBeLessThan(at('className="btn reg-save"'))
  })
  it('el menú de «Crear» (gasto fijo, deuda, meta, categoría) se abre arriba y no al final', () => {
    expect(at("openForm('fixed')")).toBeLessThan(at('className="keypad reg-keys"'))
    expect(at("openForm('category')")).toBeLessThan(at('className="btn reg-save"'))
  })
  it('«Más opciones» está antes del teclado y de guardar', () => {
    const mas = at('reg-more')
    expect(mas).toBeLessThan(at('className="keypad reg-keys"'))
    expect(mas).toBeLessThan(at('className="btn reg-save"'))
    expect(mas).toBeGreaterThan(at('aria-label="De quién es el gasto"'))
  })
  it('ya no queda un «Crear otra cosa» enterrado al final de la pantalla', () => {
    expect(register.indexOf("{others ? 'Ocultar' : 'Crear otra cosa'}")).toBe(-1)
    expect(register.lastIndexOf('className="reg-rows"')).toBeLessThan(at('className="keypad reg-keys"'))
  })
  it('el CSS de los accesos no los saca de la vista y son táctiles de 48 px', () => {
    const rule = (sel: string) => css.split('\n').filter((l) => l.includes(sel)).join('\n')
    for (const sel of ['.reg-create', '.reg-more']) {
      const r = rule(sel)
      expect(r, sel).toMatch(/min-height: 48px/)
      expect(r, sel).not.toMatch(/position: (absolute|fixed)|display: none|visibility: hidden|overflow: hidden|margin-top: -?\d{3,}/)
    }
  })

  describe('«Más opciones» no esconde el teclado ni Guardar (estructura del JSX)', () => {
    /** El texto de `{more && ( ... )}`, balanceando paréntesis y llaves desde su apertura */
    function moreBlock(): string {
      const start = at('{more && (')
      let depth = 0
      for (let i = start; i < register.length; i++) {
        const c = register[i]
        if (c === '{' || c === '(') depth++
        else if (c === '}' || c === ')') {
          depth--
          if (depth === 0) return register.slice(start, i + 1)
        }
      }
      throw new Error('el bloque {more && (...)} no cierra')
    }
    it('dentro del bloque solo hay fecha, «Pagó» y descuento', () => {
      const b = moreBlock()
      expect(b).toContain('id="spent-on"')
      expect(b).toContain('aria-label="Quién pagó"')
      expect(b).toContain('id="reg-disc"')
      expect(b).not.toContain('keypad')
      expect(b).not.toContain('reg-save')
      expect(b).not.toContain('press(k)')
    })
    it('teclado y Guardar están fuera del bloque y después de «Más opciones»', () => {
      const b = moreBlock()
      const from = register.indexOf(b)
      const end = from + b.length
      for (const needle of ['className="keypad reg-keys"', 'className="btn reg-save" type="button"']) {
        const i = at(needle)
        expect(i, needle).toBeGreaterThan(end)
        expect(i, needle).toBeGreaterThan(at('reg-more'))
      }
    })
  })
})
