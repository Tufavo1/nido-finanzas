// Copyright (c) 2026 Dinovance
// Cuándo conviene avisar «ves los últimos datos cargados»: algo que no es esencial falló al leerse.

type Fail = { code?: string } | null | undefined

/** Una tabla inexistente (migración pendiente) apaga la sección; no es un fallo pasajero */
const isMissingTable = (e: Fail) => !!e && (e.code === 'PGRST205' || e.code === '42P01')

export function isFinanceStale(f: { finance?: Fail; recurring?: Fail; profiles?: Fail; incomes?: Fail }): boolean {
  return (!!f.finance && !isMissingTable(f.finance)) || !!f.recurring || !!f.profiles || !!f.incomes
}
