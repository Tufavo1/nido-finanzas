// Copyright (c) 2026 Dinovance
// Genera public/privacidad.html y public/terminos.html desde src/lib/legal.ts (la misma fuente que ve la app).
// Uso: node scripts/gen-legal.mjs   (Node 22.18 o más nuevo, sin dependencias). Se corre solo con `npm run build`.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://contigo.dinovance.cl'

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Carga legal.ts con el «quitar tipos» de Node: copia legal.ts y about.ts a una carpeta temporal con extensiones explícitas. */
async function loadLegal() {
  const dir = mkdtempSync(join(tmpdir(), 'legal-'))
  try {
    const legal = readFileSync(join(root, 'src/lib/legal.ts'), 'utf8').replace("from './about'", "from './about.ts'")
    writeFileSync(join(dir, 'legal.ts'), legal)
    cpSync(join(root, 'src/lib/about.ts'), join(dir, 'about.ts'))
    globalThis.__APP_VERSION__ = '0'
    globalThis.__COMMIT__ = '0'
    globalThis.__BUILD_DATE__ = 0
    return await import(pathToFileURL(join(dir, 'legal.ts')).href)
  } finally {
    // El módulo ya está en memoria: la carpeta temporal se puede borrar
    rmSync(dir, { recursive: true, force: true })
  }
}

export function renderDoc(doc, { date, email, slug, other }) {
  const sections = doc.sections
    .map((s) => {
      const paras = (s.paragraphs ?? []).map((p) => `      <p>${esc(p)}</p>`).join('\n')
      const items = s.items?.length ? `      <ul>\n${s.items.map((i) => `        <li>${esc(i)}</li>`).join('\n')}\n      </ul>` : ''
      return `    <section>\n      <h2>${esc(s.title)}</h2>\n${[paras, items].filter(Boolean).join('\n')}\n    </section>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${esc(doc.title)} - Contigo</title>
  <meta name="description" content="${esc(doc.title)} de Contigo, la app de finanzas para hogares.">
  <link rel="canonical" href="${SITE}/${slug}.html">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/legal.css">
</head>
<body>
  <main class="legal">
    <p><a class="back" href="${SITE}">Volver a Contigo</a></p>
    <h1>${esc(doc.title)}</h1>
    <p class="intro">${esc(doc.intro)}</p>
${sections}
    <footer>
      <p>Última actualización: ${esc(date)}. Contacto: <a href="mailto:${esc(email)}">${esc(email)}</a></p>
      <p><a href="/${other.slug}.html">${esc(other.title)}</a></p>
    </footer>
  </main>
</body>
</html>
`
}

export async function generate() {
  const { LEGAL_DOCS, LEGAL_DATE } = await loadLegal()
  const { CONTACT_EMAIL } = await import(pathToFileURL(join(root, 'src/lib/about.ts')).href).catch(() => ({ CONTACT_EMAIL: null }))
  const email = CONTACT_EMAIL ?? /CONTACT_EMAIL = '([^']+)'/.exec(readFileSync(join(root, 'src/lib/about.ts'), 'utf8'))?.[1]
  const pages = { privacidad: LEGAL_DOCS.privacy, terminos: LEGAL_DOCS.terms }
  const out = {}
  for (const [slug, doc] of Object.entries(pages)) {
    const otherSlug = slug === 'privacidad' ? 'terminos' : 'privacidad'
    out[slug] = renderDoc(doc, { date: LEGAL_DATE, email, slug, other: { slug: otherSlug, title: pages[otherSlug].title } })
  }
  return out
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const pages = await generate()
  mkdirSync(join(root, 'public'), { recursive: true })
  for (const [slug, html] of Object.entries(pages)) writeFileSync(join(root, 'public', `${slug}.html`), html)
  console.log('Generado: public/privacidad.html, public/terminos.html')
}
