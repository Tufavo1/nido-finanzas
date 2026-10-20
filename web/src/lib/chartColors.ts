import type { Level } from './finance'

// Todos los colores salen de la paleta de la app (mezclados entre sí para tener seis distintos)
export const SLICE_COLORS = [
  'var(--accent)',
  'var(--blue)',
  'var(--amber)',
  'color-mix(in srgb, var(--accent) 55%, var(--blue))',
  'color-mix(in srgb, var(--blue) 50%, var(--amber))',
  'color-mix(in srgb, var(--muted) 55%, var(--surface))',
]

const LEVEL_COLOR: Record<Level, string> = { ok: 'var(--accent)', warn: 'var(--amber)', bad: 'var(--warn)' }
export const levelColor = (l: Level): string => LEVEL_COLOR[l]
