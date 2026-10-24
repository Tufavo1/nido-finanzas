/** Del sueldo bruto al líquido en Chile: AFP, salud, seguro de cesantía e impuesto de segunda categoría. */

/**
 * Valores de referencia. Se revisan a mano al menos una vez al año (y cuando cambie alguna ley):
 *  · UTM: noviembre de 2026, Circular N° 39 del SII (la tabla de impuesto se expresa en UTM).
 *  · UF: ~20 de octubre de 2026 (Banco Central). Solo se usa para los topes imponibles.
 *  · Topes imponibles 2026: 90 UF (AFP y salud) y 135,2 UF (seguro de cesantía), Superintendencia de Pensiones.
 *  · Comisiones de las AFP: junio de 2026, Superintendencia de Pensiones.
 *  · Retención de honorarios 2026: 15,25 %.
 */
export const CL = {
  actualizado: 'octubre de 2026',
  utm: 72440,
  uf: 41190,
  topeAfpUf: 90,
  topeCesantiaUf: 135.2,
  /** Parte de la AFP que va a tu fondo de pensión */
  afpFondo: 0.1,
  salud: 0.07,
  /** Seguro de cesantía que paga el trabajador (solo contrato indefinido) */
  cesantia: 0.006,
  honorarios: 0.1525,
} as const

/** Comisión mensual de cada AFP, en % del sueldo imponible */
export const AFPS = [
  { id: 'uno', name: 'Uno', comision: 0.46 },
  { id: 'modelo', name: 'Modelo', comision: 0.58 },
  { id: 'planvital', name: 'PlanVital', comision: 1.16 },
  { id: 'habitat', name: 'Habitat', comision: 1.27 },
  { id: 'capital', name: 'Capital', comision: 1.44 },
  { id: 'cuprum', name: 'Cuprum', comision: 1.44 },
  { id: 'provida', name: 'Provida', comision: 1.45 },
] as const

export type AfpId = (typeof AFPS)[number]['id']
export type Contrato = 'indefinido' | 'plazo_fijo' | 'honorarios'

/** Impuesto único de segunda categoría (art. 43 N° 1 de la Ley de la Renta). Tramos y rebajas en UTM. */
const TRAMOS = [
  { hasta: 13.5, tasa: 0, rebaja: 0 },
  { hasta: 30, tasa: 0.04, rebaja: 0.54 },
  { hasta: 50, tasa: 0.08, rebaja: 1.74 },
  { hasta: 70, tasa: 0.135, rebaja: 4.49 },
  { hasta: 90, tasa: 0.23, rebaja: 11.14 },
  { hasta: 120, tasa: 0.304, rebaja: 17.8 },
  { hasta: 310, tasa: 0.35, rebaja: 23.32 },
  { hasta: Infinity, tasa: 0.4, rebaja: 38.82 },
] as const

/** Impuesto del mes sobre la renta imponible ya descontadas AFP, salud y cesantía */
export function impuestoUnico(base: number): number {
  if (base <= 0) return 0
  const t = TRAMOS.find((x) => base <= x.hasta * CL.utm) ?? TRAMOS[TRAMOS.length - 1]
  return Math.max(0, Math.round(base * t.tasa - t.rebaja * CL.utm))
}

export interface Descuento {
  key: 'afp' | 'comision' | 'salud' | 'cesantia' | 'impuesto' | 'retencion'
  label: string
  /** Pesos que se descuentan */
  monto: number
}

export interface Liquido {
  bruto: number
  descuentos: Descuento[]
  /** Lo que llega a tu cuenta */
  liquido: number
  /** Lo que se descuenta en total, en % del bruto */
  descuentoPct: number
  /** El bruto pasó el tope: solo se cotiza hasta el tope */
  sobreTope: boolean
}

export function calcularLiquido(opts: { bruto: number; contrato: Contrato; afp: AfpId }): Liquido {
  const bruto = Math.max(0, Math.round(opts.bruto))
  if (opts.contrato === 'honorarios') {
    const monto = Math.round(bruto * CL.honorarios)
    return resultado(bruto, [{ key: 'retencion', label: `Retención de honorarios (${String(CL.honorarios * 100).replace('.', ',')} %)`, monto }], false)
  }
  const afp = AFPS.find((a) => a.id === opts.afp) ?? AFPS[0]
  const topeAfp = CL.topeAfpUf * CL.uf
  const topeCes = CL.topeCesantiaUf * CL.uf
  const baseAfp = Math.min(bruto, topeAfp)
  const fondo = Math.round(baseAfp * CL.afpFondo)
  const comision = Math.round((baseAfp * afp.comision) / 100)
  const salud = Math.round(baseAfp * CL.salud)
  const cesantia = opts.contrato === 'indefinido' ? Math.round(Math.min(bruto, topeCes) * CL.cesantia) : 0
  const impuesto = impuestoUnico(bruto - fondo - comision - salud - cesantia)
  const lista: Descuento[] = [
    { key: 'afp', label: 'AFP (ahorro para tu jubilación)', monto: fondo },
    { key: 'comision', label: `Comisión de la AFP ${afp.name} (${String(afp.comision).replace('.', ',')} %)`, monto: comision },
    { key: 'salud', label: 'Salud (7 %)', monto: salud },
  ]
  if (cesantia > 0) lista.push({ key: 'cesantia', label: 'Seguro de cesantía (0,6 %)', monto: cesantia })
  lista.push({ key: 'impuesto', label: 'Impuesto a la renta', monto: impuesto })
  return resultado(bruto, lista, bruto > topeAfp)
}

function resultado(bruto: number, descuentos: Descuento[], sobreTope: boolean): Liquido {
  const total = descuentos.reduce((s, d) => s + d.monto, 0)
  return { bruto, descuentos, liquido: bruto - total, descuentoPct: bruto > 0 ? Math.round((total * 1000) / bruto) / 10 : 0, sobreTope }
}
