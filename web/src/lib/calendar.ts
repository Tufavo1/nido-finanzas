/** 48.900 -> "49k", 1.250.000 -> "1,3M" */
export function compact(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace('.0', '').replace('.', ',')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** Celdas del mes empezando en lunes; null = espacio vacío */
export function monthGrid(year: number, month: number): (number | null)[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}