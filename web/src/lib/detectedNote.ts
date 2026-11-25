/** Texto de un movimiento detectado: una frase por línea y todas con punto final */
export function detectedNote(o: { category: string | null; source: string | null; installment: { n: number; total: number } | null }): string {
  const lines = [o.category ? `Categoría sugerida: ${o.category}.` : 'Aún no sabemos la categoría.']
  if (o.source) lines.push(`Detectado desde ${o.source}.`)
  if (o.installment) lines.push(`Cuota ${o.installment.n} de ${o.installment.total}.`)
  return lines.join('\n')
}
