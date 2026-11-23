// Copyright (c) 2026 Dinovance
// Actualizar al deslizar: cuánto se estiró y si ya se puede soltar. Lógica pura.

export const PULL_THRESHOLD = 72
const PULL_MAX = 120
/** El dedo recorre más de lo que se estira la pantalla: da sensación de resistencia */
const RESISTANCE = 0.5

export interface PullView {
  distance: number
  ready: boolean
}

export function pullView(dragPx: number): PullView {
  const distance = Math.min(PULL_MAX, Math.max(0, dragPx) * RESISTANCE * 2)
  return { distance, ready: distance >= PULL_THRESHOLD }
}
