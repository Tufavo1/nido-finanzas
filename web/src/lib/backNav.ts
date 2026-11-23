// Copyright (c) 2026 Dinovance
// Botón atrás de Android (RF-11): decide qué hacer según dónde está la persona. Lógica pura.

export type BackAction = { kind: 'close-overlay' } | { kind: 'go'; tab: string } | { kind: 'confirm-discard'; tab: string } | { kind: 'minimize' }

/** Pantallas que cuelgan de otra: atrás vuelve a su origen. El resto vuelve a Inicio. */
const PARENT: Record<string, string> = { help: 'security', profile: 'security' }
const HOME = 'home'

export function backAction(state: { overlayOpen: boolean; tab: string; dirty?: boolean }): BackAction {
  if (state.overlayOpen) return { kind: 'close-overlay' }
  if (state.tab === HOME) return { kind: 'minimize' }
  const tab = PARENT[state.tab] ?? HOME
  return state.dirty ? { kind: 'confirm-discard', tab } : { kind: 'go', tab }
}
