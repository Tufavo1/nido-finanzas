// Copyright (c) 2026 Dinovance
// Datos que el teléfono necesita para guardar y enviar solo, con la app cerrada. Lógica pura.
import { pickDefaultCategory } from './autoCategory'
import { buildAutoCategories, ownerKeyOf } from './nativeBridge'
import type { AutoProfileOptions } from './nativeBridge'
import { resolveApiBase } from './nativeApi'

/** Dirección del Worker para el envío en segundo plano: solo https; sin ella no se envía nada solo. */
export function syncApiBase(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null
  try {
    return resolveApiBase(raw, true)
  } catch {
    // Dirección inválida o sin TLS: el envío en segundo plano queda desactivado
    return null
  }
}

interface ProfileInput {
  userId: string
  householdId: string
  shared: boolean
  categories: { id: string; name: string }[]
  history: { note: string | null; category_id: string }[]
}

/** Quien guarda es siempre la persona dueña del teléfono (`paidBy`); un gasto personal nunca va a nombre de la pareja. */
export function buildAutoProfile(i: ProfileInput): AutoProfileOptions {
  const defaultCategoryId = pickDefaultCategory(i.categories)
  return {
    ownerKey: ownerKeyOf(i.userId, i.householdId),
    userId: i.userId,
    householdId: i.householdId,
    paidBy: i.userId,
    shared: i.shared,
    categories: buildAutoCategories(i.history, new Set(i.categories.map((c) => c.id))),
    // Sin esto el teléfono no guarda solo un comercio nuevo; sin categorías se omite
    ...(defaultCategoryId ? { defaultCategoryId } : {}),
  }
}
