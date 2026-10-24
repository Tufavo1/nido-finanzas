import type { ReactNode } from 'react'

/** Texto con **énfasis**: se muestra en negrita, sin comillas ni símbolos raros. Nunca interpreta HTML. */
export function Rich({ text }: { text: string }): ReactNode {
  return text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}
