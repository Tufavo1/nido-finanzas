/** «1 deuda más» / «3 deudas más»: el contador de los botones «Ver más» con el plural correcto */
export const moreCount = (n: number, singular: string, plural: string): string => `${n} ${n === 1 ? singular : plural} más`

/** «1 día», «0 días», «2 días»: la cantidad con su palabra en singular o plural */
export const plural = (n: number, singular: string, plural: string): string => `${n} ${n === 1 ? singular : plural}`

/** «1 peso», «2 pesos»: para lo que lee un lector de pantalla */
export const pesos = (n: number): string => plural(n, 'peso', 'pesos')

/** «1 movimiento detectado», «3 movimientos detectados» (insignia de Inicio) */
export const detectedLabel = (n: number): string => plural(n, 'movimiento detectado', 'movimientos detectados')

/** Lectura de la barra «De cada $100 que ganas» con cada cantidad bien concordada */
export const per100Label = (p: { spent: number; debts: number; pending: number; saved: number; left: number }): string =>
  `Gastos ${pesos(p.spent)}, deudas ${pesos(p.debts)}, fijos por venir ${pesos(p.pending)}, ahorro ${pesos(p.saved)}, te sobran ${pesos(p.left)}`
