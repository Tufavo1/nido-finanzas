// Copyright (c) 2026 Dinovance
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LEGAL_DATE, LEGAL_DOCS, LEGAL_VERSION, PRIVACY } from './legal'
import { CONTACT_EMAIL } from './about'

const pub = (f: string) => readFileSync(new URL(`../../public/${f}`, import.meta.url), 'utf8')
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const script = '../../scripts/gen-legal.mjs'
const pages = { privacidad: LEGAL_DOCS.privacy, terminos: LEGAL_DOCS.terms }

describe('páginas legales públicas', () => {
  it('los archivos de public/ están al día con legal.ts (si falla: node scripts/gen-legal.mjs)', async () => {
    const { generate } = (await import(/* @vite-ignore */ script)) as { generate: () => Promise<Record<string, string>> }
    const out = await generate()
    expect(out['privacidad']).toBe(pub('privacidad.html'))
    expect(out['terminos']).toBe(pub('terminos.html'))
  })

  for (const [slug, doc] of Object.entries(pages)) {
    describe(slug, () => {
      const html = pub(`${slug}.html`)
      it('trae todas las secciones, párrafos y puntos del texto de la app', () => {
        expect(html).toContain(`<h1>${esc(doc.title)}</h1>`)
        expect(html).toContain(esc(doc.intro))
        for (const s of doc.sections) {
          expect(html).toContain(`<h2>${esc(s.title)}</h2>`)
          for (const t of [...(s.paragraphs ?? []), ...(s.items ?? [])]) expect(html).toContain(esc(t))
        }
        expect(html.match(/<h2>/g)).toHaveLength(doc.sections.length)
      })
      it('cumple la CSP: sin <style>, <script> ni style= en línea; hoja externa propia', () => {
        expect(html).not.toMatch(/<style|<script|\sstyle=|\son\w+=/i)
        expect(html).toContain('<link rel="stylesheet" href="/legal.css">')
      })
      it('es accesible y legible en móvil, con fecha, correo y vuelta a la app', () => {
        expect(html).toContain('<html lang="es">')
        expect(html).toMatch(/<title>[^<]+<\/title>/)
        expect(html).toContain('name="viewport"')
        expect(html).toContain('Volver a Contigo')
        expect(html).toContain('href="https://contigo.dinovance.cl"')
        expect(html).toContain(LEGAL_DATE)
        expect(html).toContain(`mailto:${CONTACT_EMAIL}`)
      })
    })
  }

  it('la política dice lo del Android y del inicio con Google', () => {
    const html = pub('privacidad.html')
    expect(html).toContain('La app de Android y los avisos de tu banco')
    expect(html).toContain('No tenemos acceso a tu Gmail, tus contactos ni tu Drive.')
    expect(html).toContain('120 caracteres')
    expect(html).toContain('GitHub Releases')
    expect(html).toContain('no se guarda ni se envía a nuestros servidores')
    expect(PRIVACY.sections.map((s) => s.title)).toContain('La app de Android y los avisos de tu banco')
    expect(LEGAL_DATE).toBe('22 de noviembre de 2026')
    expect(LEGAL_VERSION).toBe('2026-11-02')
  })

  it('la hoja de estilos es propia, con tema claro y oscuro', () => {
    const css = pub('legal.css')
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).not.toMatch(/@import|url\(http/)
  })

  it('se sirven como archivos estáticos y nada los bloquea', () => {
    const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')
    expect(wrangler).toContain('"not_found_handling": "single-page-application"')
    expect(wrangler).toContain('"run_worker_first": ["/supabase/*"]')
    const headers = pub('_headers')
    expect(headers).toMatch(/style-src 'self'/)
    expect(pub('robots.txt')).not.toMatch(/Disallow:\s*\S/)
  })
})
