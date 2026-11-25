// Copyright (c) 2026 Dinovance
// Categoría general para que el teléfono guarde solo una compra aunque el comercio sea nuevo. Lógica pura.

const GENERAL = ['otros', 'otro', 'sin categoria', 'varios', 'general']

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Prefiere «Otros» o «Sin categoría»; si no hay, la primera de la lista (ya viene ordenada y sin archivadas); sin categorías, null (el campo se omite). */
export function pickDefaultCategory(categories: readonly { id: string; name: string }[]): string | null {
  for (const g of GENERAL) {
    const hit = categories.find((c) => norm(c.name) === g)
    if (hit) return hit.id
  }
  return categories[0]?.id ?? null
}

/** ¿Es la categoría general («Otros», «Sin categoría»…)? Un gasto que cae ahí no es una decisión de la persona: solo es el último recurso. */
export function isGeneralCategory(categoryId: string, categories: readonly { id: string; name: string }[]): boolean {
  const c = categories.find((x) => x.id === categoryId)
  return c !== undefined && GENERAL.includes(norm(c.name))
}
