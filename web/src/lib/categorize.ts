/**
 * Adivina en qué categoría va un gasto a partir de su nombre («Lider Express», «Copec»…).
 * Primero aprende de la persona: si ya anotó ese comercio, usa la categoría que eligió más veces.
 * Si es la primera vez, reconoce comercios conocidos de Chile. Si no sabe, no inventa (null).
 */

interface Cat {
  id: string
  name: string
}
interface Past {
  note: string | null
  category_id: string
}

/** Palabras del nombre de la categoría → comercios que suelen ir ahí. «hogar» va antes para que «metrogas» no caiga en «metro». */
const KNOWN: { category: string; words: string[] }[] = [
  {
    category: 'hogar',
    words: ['enel', 'cge', 'aguas andinas', 'essbio', 'esval', 'metrogas', 'gasco', 'lipigas', 'abastible', 'vtr', 'movistar', 'entel', 'wom', 'claro', 'mundo pacifico', 'arriendo', 'gastos comunes', 'sodimac', 'easy', 'internet', 'luz', 'agua'],
  },
  {
    category: 'supermercado',
    words: ['lider', 'jumbo', 'unimarc', 'santa isabel', 'tottus', 'acuenta', 'alvi', 'mayorista', 'supermercado', 'almacen', 'feria', 'panaderia', 'minimarket'],
  },
  {
    category: 'transporte',
    words: ['copec', 'shell', 'petrobras', 'aramco', 'uber', 'cabify', 'didi', 'metro', 'bip', 'peaje', 'autopista', 'estacionamiento', 'bencina', 'taxi', 'red movilidad', 'turbus', 'pullman'],
  },
  {
    category: 'salud',
    words: ['farmacia', 'cruz verde', 'salcobrand', 'ahumada', 'dr simi', 'clinica', 'hospital', 'dental', 'dentista', 'consulta', 'isapre', 'fonasa', 'laboratorio', 'optica'],
  },
  {
    category: 'ocio',
    words: ['netflix', 'spotify', 'disney', 'hbo', 'prime video', 'youtube', 'cine', 'cinemark', 'cinepolis', 'cineplanet', 'restaurant', 'bar', 'pub', 'starbucks', 'mcdonald', 'burger', 'pizza', 'sushi', 'pedidosya', 'rappi', 'uber eats', 'steam', 'playstation', 'cafe'],
  },
]

/** Minúsculas, sin tildes ni signos */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** La categoría más repetida entre los gastos que cumplen; en empate, la del gasto más reciente (la lista viene de más nuevo a más viejo) */
function mostUsed(history: Past[], valid: Set<string>, match: (note: string) => boolean): string | null {
  const count = new Map<string, number>()
  for (const h of history) {
    if (!h.note || !valid.has(h.category_id) || !match(norm(h.note))) continue
    count.set(h.category_id, (count.get(h.category_id) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [id, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = id
  return best
}

export function suggestCategory(note: string, categories: Cat[], history: Past[]): string | null {
  const n = norm(note)
  if (!n) return null
  const valid = new Set(categories.map((c) => c.id))

  // 1. Lo que la persona ya eligió para ese mismo nombre
  const same = mostUsed(history, valid, (x) => x === n)
  if (same) return same

  // 2. El mismo comercio en otra sucursal: coincide la primera palabra
  const first = n.split(' ')[0] ?? ''
  if (first.length >= 4) {
    const chain = mostUsed(history, valid, (x) => x.split(' ')[0] === first)
    if (chain) return chain
  }

  // 3. Comercios conocidos
  const padded = ` ${n} `
  for (const group of KNOWN) {
    // Palabras cortas («bar», «luz») solo valen enteras; las largas también como comienzo («farmacia» en «farmacias»)
    if (!group.words.some((w) => padded.includes(w.length <= 4 ? ` ${w} ` : ` ${w}`))) continue
    const cat = categories.find((c) => norm(c.name).includes(group.category))
    if (cat) return cat.id
  }
  return null
}

/**
 * ¿Compartido o personal? Lo que la persona eligió más veces para esa categoría; en empate, lo del gasto
 * más reciente (la lista viene de más nuevo a más viejo). null si aún no hay gastos en esa categoría.
 */
export function suggestShared(categoryId: string, history: { category_id: string; shared: boolean }[]): boolean | null {
  const mine = history.filter((h) => h.category_id === categoryId)
  if (!categoryId || mine.length === 0) return null
  const shared = mine.filter((h) => h.shared).length
  const personal = mine.length - shared
  return shared === personal ? mine[0]!.shared : shared > personal
}
