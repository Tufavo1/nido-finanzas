/**
 * Tasas y costos que publica cada banco, copiados de sus tarifarios oficiales.
 * Para actualizar: cambia los números y la `vigencia` de ese banco (o agrega otro banco al final de BANKS).
 * La app muestra la fecha y avisa cuando un dato es viejo o no trae fecha.
 */

export type RateProduct = 'consumo' | 'tarjeta' | 'hipotecario' | 'linea'

export interface RateEntry {
  product: RateProduct
  label: string
  /** Si la tasa depende del monto: rango en pesos al que aplica */
  from?: number
  to?: number
  /** Porcentajes en la unidad indicada. Sin `min`, el banco solo publica el máximo. */
  min?: number
  max: number
  unit: 'mensual' | 'anual'
  /** Es un crédito en UF: la tasa anual va sobre la UF, no sobre pesos */
  uf?: boolean
  /** Es el tope que puede cobrar el banco, no una tasa ofrecida */
  cap?: boolean
  note?: string
}

export interface BankExtra {
  product: RateProduct | 'general'
  text: string
}

export interface Bank {
  id: string
  name: string
  /** Desde cuándo rige lo publicado (YYYY-MM-DD); null si el documento no trae fecha */
  vigencia: Partial<Record<RateProduct, string | null>>
  rates: RateEntry[]
  extras: BankExtra[]
}

export const PRODUCTS: { key: RateProduct; label: string; plural: string; help: string; comparable: boolean }[] = [
  { key: 'consumo', label: 'Crédito de consumo', plural: 'créditos de consumo', help: 'Un préstamo en pesos que se paga en cuotas.', comparable: true },
  { key: 'tarjeta', label: 'Tarjeta de crédito', plural: 'tarjetas de crédito', help: 'Las compras y los avances que se pagan en cuotas con la tarjeta.', comparable: true },
  { key: 'hipotecario', label: 'Hipotecario', plural: 'créditos hipotecarios', help: 'El crédito para comprar una vivienda. Va en UF y se paga a muchos años.', comparable: true },
  { key: 'linea', label: 'Línea de crédito', plural: 'líneas de crédito', help: 'Un cupo que se usa cuando la cuenta se queda sin plata.', comparable: false },
]

export const BANKS: Bank[] = [
  {
    id: 'falabella',
    name: 'Banco Falabella',
    vigencia: { consumo: '2026-10-15', tarjeta: '2026-10-15', linea: '2026-10-15', hipotecario: '2026-02-01' },
    rates: [
      { product: 'consumo', label: 'Hasta $1.000.000 (24 a 36 meses)', to: 1_000_000, min: 1.63, max: 3.42, unit: 'mensual' },
      { product: 'consumo', label: 'Desde $3.000.000 (24 a 36 meses)', from: 3_000_000, min: 1.26, max: 2.84, unit: 'mensual' },
      { product: 'tarjeta', label: 'Compras y avances CMR hasta $2.058.136', to: 2_058_136, max: 3.41, unit: 'mensual' },
      { product: 'tarjeta', label: 'Compras y avances CMR de $2.058.137 a $8.232.545', from: 2_058_137, to: 8_232_545, max: 2.83, unit: 'mensual' },
      { product: 'tarjeta', label: 'Compras y avances CMR desde $8.232.546', from: 8_232_546, max: 2.49, unit: 'mensual' },
      { product: 'tarjeta', label: 'Súper Avance CMR con descuento, de $3 a $5 millones en 48 cuotas', from: 3_000_000, to: 5_000_000, min: 2.15, max: 2.49, unit: 'mensual', note: 'Es una oferta con descuento y no siempre está disponible.' },
      { product: 'hipotecario', label: 'Tasa pizarra (5 a 30 años)', min: 4.35, max: 4.69, unit: 'anual', uf: true },
      {
        product: 'hipotecario',
        label: 'Con descuento, a 30 años y con 80 % de financiamiento, abonando el sueldo en cuenta corriente y con pago automático',
        min: 3.78,
        max: 4.12,
        unit: 'anual',
        uf: true,
      },
      { product: 'linea', label: 'Hasta UF 50', max: 3.42, unit: 'mensual', cap: true },
      { product: 'linea', label: 'Más de UF 50 y hasta UF 200', max: 2.84, unit: 'mensual', cap: true },
      { product: 'linea', label: 'Más de UF 200 y hasta UF 5.000', max: 2.5, unit: 'mensual', cap: true },
      { product: 'linea', label: 'Más de UF 5.000', max: 0.84, unit: 'mensual', cap: true },
    ],
    extras: [
      { product: 'tarjeta', text: 'La tarjeta CMR cobra una administración de entre 0,085 y 0,35 UF al mes según su tipo. Se puede evitar acumulando puntos.' },
      { product: 'hipotecario', text: 'El seguro de desgravamen es obligatorio y cuesta 0,012544 % del saldo. El de incendio también es obligatorio y cuesta 0,008411 % del valor de la tasación.' },
      { product: 'hipotecario', text: 'Al partir hay que pagar la tasación (2,98 UF), el estudio de títulos (4,7 UF), el borrador de escritura (4,2 UF), la notaría (desde 3 UF) y el impuesto al mutuo (0,8 % en una vivienda usada).' },
      { product: 'general', text: 'Si te atrasas, desde el día 20 el banco cobra gastos de cobranza. Son un 9 % sobre los primeros 10 UF vencidos, un 6 % entre 10 y 50 UF y un 3 % sobre lo que pase de 50 UF.' },
    ],
  },
  {
    id: 'santander',
    name: 'Banco Santander',
    // Los documentos de Santander no traen fecha de vigencia
    vigencia: { consumo: null, tarjeta: null, hipotecario: null, linea: null },
    rates: [
      { product: 'consumo', label: 'Hasta $1.000.000 (24 a 36 meses)', to: 1_000_000, max: 40.8, unit: 'anual', note: 'Es el máximo que puede cobrar. La tasa que te den puede ser menor.' },
      { product: 'consumo', label: 'Desde $3.000.000 (24 a 36 meses)', from: 3_000_000, max: 33.96, unit: 'anual', note: 'Es el máximo que puede cobrar. La tasa que te den puede ser menor.' },
      { product: 'tarjeta', label: 'Tarjeta Universal, tasa efectiva anual', min: 26, max: 35.46, unit: 'anual' },
      { product: 'hipotecario', label: 'Tope de 5 a 20 años (hasta 2.000 UF)', max: 6.48, unit: 'anual', uf: true, cap: true },
      { product: 'hipotecario', label: 'Tope de 9 a 15 años (sobre 2.000 UF)', max: 5.68, unit: 'anual', uf: true, cap: true },
    ],
    extras: [
      { product: 'consumo', text: 'Se puede prepagar sin avisar antes y cuesta 1 mes de intereses.' },
      { product: 'tarjeta', text: 'La tarjeta Universal cobra 0,14 UF de mantención al mes. Si prepagas compras en cuotas, te cobran 1 mes de intereses.' },
      { product: 'hipotecario', text: 'Si prepagas parte del hipotecario, te cobran 1,5 meses de interés sobre lo que adelantes.' },
      { product: 'hipotecario', text: 'Al partir hay que pagar el estudio de título (4,4 UF), la tasación (desde 2,5 UF), la notaría (3,5 UF) y el impuesto al mutuo (0,8 %, o 0,2 % si es DFL2). Los seguros se pagan cada mes y cuestan 0,007715 % el de desgravamen y 0,026329 % el de incendio y sismo.' },
      { product: 'general', text: 'Si te atrasas, desde el día 20 el banco cobra gastos de cobranza. Son un 9 % sobre los primeros 10 UF vencidos, un 6 % entre 10 y 50 UF y un 3 % sobre lo que pase de 50 UF.' },
    ],
  },
]
