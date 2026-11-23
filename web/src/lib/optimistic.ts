// Copyright (c) 2026 Dinovance

export type OptimisticResult = { ok: true } | { ok: false; error: unknown }

/** UI optimista: se muestra el cambio al instante; si el servidor lo rechaza, se revierte y se devuelve el error (nada se traga). */
export async function runOptimistic(apply: () => void, commit: () => Promise<void>, revert: () => void): Promise<OptimisticResult> {
  apply()
  try {
    await commit()
    return { ok: true }
  } catch (error) {
    revert()
    return { ok: false, error }
  }
}
