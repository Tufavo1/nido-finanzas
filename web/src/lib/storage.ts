/** Cuánto tardaría en llenarse la base a este ritmo, dicho en palabras */
export function fillForecast(dbBytes: number, limitBytes: number, bytesPerDay: number): { days: number | null; text: string } {
  const free = Math.max(0, limitBytes - dbBytes)
  if (free === 0) return { days: 0, text: 'La base ya alcanzó el límite del plan gratuito.' }
  if (bytesPerDay < 1) return { days: null, text: 'Casi no está creciendo: hay espacio de sobra.' }
  const days = Math.floor(free / bytesPerDay)
  if (days > 3650) return { days, text: 'A este ritmo el espacio alcanza por más de 10 años.' }
  if (days >= 365) {
    const years = Math.round((days / 365) * 10) / 10
    return { days, text: `A este ritmo el espacio alcanza por unos ${String(years).replace('.', ',')} años.` }
  }
  if (days >= 60) return { days, text: `A este ritmo el espacio alcanza por unos ${Math.round(days / 30)} meses.` }
  return { days, text: `Ojo: a este ritmo el espacio se acaba en unos ${days} días.` }
}

/** Nombres de tablas en lenguaje de persona, para el panel */
export const TABLE_LABEL: Record<string, string> = {
  expenses: 'Gastos',
  contributions: 'Aportes a metas',
  debt_payments: 'Pagos de deudas',
  incomes: 'Ingresos extra',
  recurring_expenses: 'Gastos fijos',
  categories: 'Categorías',
  goals: 'Metas',
  debts: 'Deudas',
  members: 'Personas',
  households: 'Hogares',
  salaries: 'Sueldos',
  profiles: 'Perfiles',
  push_subscriptions: 'Avisos push',
  widget_tokens: 'Widgets',
  invite_attempts: 'Intentos de invitación',
}
