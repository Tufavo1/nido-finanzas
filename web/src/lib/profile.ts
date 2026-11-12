import type { Profile } from './data'
import { ageOn, lifeStageTip } from './birth'

export type Employment = 'dependiente' | 'independiente' | 'honorarios' | 'estudiante' | 'otro'

export const EMPLOYMENT: { key: Employment; label: string; hint: string }[] = [
  { key: 'dependiente', label: 'Con contrato', hint: 'Sueldo fijo cada mes' },
  { key: 'independiente', label: 'Independiente', hint: 'Ingresos que cambian mes a mes' },
  { key: 'honorarios', label: 'Honorarios', hint: 'Boletas de honorarios' },
  { key: 'estudiante', label: 'Estudiante', hint: 'Ingresos chicos o mesada' },
  { key: 'otro', label: 'Otro', hint: 'Cualquier otra situación' },
]

interface Group {
  key: string
  label: string
  words: string[]
  /** Su ingreso suele variar aunque tenga contrato (turnos, comisiones, propinas) */
  variable: boolean
  tips: string[]
}

const GROUPS: Group[] = [
  {
    key: 'salud',
    label: 'Salud',
    words: ['enfermer', 'medic', 'doctor', 'kinesi', 'paramedic', 'tens', 'dentist', 'matron', 'nutricion', 'psicolog', 'quimico'],
    variable: true,
    tips: [
      'Los turnos y horas extra cambian tu sueldo: presupuesta con el monto más bajo y trata lo extra como ahorro.',
      'Aparta algo cada mes para cursos y renovación de certificaciones.',
    ],
  },
  {
    key: 'educacion',
    label: 'Educación',
    words: ['profesor', 'docente', 'educador', 'parvul', 'academic', 'tutor', 'maestra'],
    variable: false,
    tips: [
      'Con ingreso estable, automatizar el ahorro el día de pago funciona muy bien.',
      'Separa un monto mensual para materiales y perfeccionamiento.',
    ],
  },
  {
    key: 'tecnologia',
    label: 'Tecnología',
    words: ['program', 'desarrollad', 'software', 'informatic', 'sistemas', 'datos', 'devops', 'tecnolog', 'ti '],
    variable: false,
    tips: [
      'Si trabajas con proveedores del exterior o en dólares, mira el ingreso en pesos para presupuestar.',
      'Reserva para equipo (computador, pantalla) en vez de endeudarte al cambiarlo.',
    ],
  },
  {
    key: 'construccion',
    label: 'Construcción y oficios',
    words: ['albanil', 'constructor', 'maestro', 'electric', 'gasfiter', 'carpint', 'soldador', 'pintor', 'obra', 'mecanic', 'tecnico'],
    variable: true,
    tips: [
      'El trabajo por obra tiene meses buenos y malos: guarda en los buenos para cubrir los flojos.',
      'Separa un monto para herramientas y reposición; son parte del costo de trabajar.',
    ],
  },
  {
    key: 'transporte',
    label: 'Transporte y reparto',
    words: ['conductor', 'chofer', 'uber', 'camion', 'delivery', 'repartidor', 'taxi', 'transport', 'logistic', 'bodeg'],
    variable: true,
    tips: [
      'Lleva aparte combustible y mantención del vehículo: son tu mayor costo de trabajar.',
      'Aparta para repuestos y revisión técnica antes de que lleguen como sorpresa.',
    ],
  },
  {
    key: 'comercio',
    label: 'Comercio y ventas',
    words: ['vendedor', 'comerciante', 'cajero', 'reponedor', 'tienda', 'ventas', 'retail', 'promotor', 'comercial'],
    variable: true,
    tips: [
      'Si ganas comisiones, vive con el sueldo base y ahorra las comisiones completas.',
      'Revisa los meses de más venta del año y guarda de ahí para los meses flojos.',
    ],
  },
  {
    key: 'gastronomia',
    label: 'Gastronomía',
    words: ['cocin', 'garzon', 'mesero', 'chef', 'barista', 'bartender', 'pastel', 'panader', 'gastronom'],
    variable: true,
    tips: [
      'Las propinas son variables: no las cuentes dentro del presupuesto fijo.',
      'Ahorra en los meses de temporada alta para cubrir los de temporada baja.',
    ],
  },
  {
    key: 'seguridad',
    label: 'Seguridad y servicio público',
    words: ['carabinero', 'militar', 'guardia', 'bombero', 'policia', 'gendarme', 'funcionari', 'municipal'],
    variable: false,
    tips: [
      'Ingreso estable: aprovecha para fijar un ahorro automático el día de pago.',
      'Revisa si tienes beneficios (bonos, asignaciones) y trátalos como ahorro, no como gasto.',
    ],
  },
  {
    key: 'administracion',
    label: 'Administración y oficina',
    words: ['administrativ', 'contador', 'secretari', 'asistente', 'analista', 'gerente', 'jefe', 'ejecutiv', 'recursos humanos', 'auditor', 'abogad'],
    variable: false,
    tips: [
      'Con ingreso estable, el mayor riesgo son las deudas de consumo: mantén las cuotas bajo el 30 % del sueldo.',
      'Si te dan bono anual, decide de antemano cuánto va a deudas y cuánto a ahorro.',
    ],
  },
  {
    key: 'creativo',
    label: 'Creativo y artes',
    words: ['diseñ', 'disen', 'fotograf', 'artista', 'musico', 'editor', 'ilustrador', 'video', 'escritor', 'arquitect', 'creativ'],
    variable: true,
    tips: [
      'Los proyectos llegan por rachas: guarda un ahorro para los meses sin encargos.',
      'Anota tus clientes y fechas de cobro; la plata atrasada también cuenta como riesgo.',
    ],
  },
  {
    key: 'estudiante',
    label: 'Estudiante',
    words: ['estudiante', 'universitari', 'alumno', 'tesista', 'practicante'],
    variable: true,
    tips: [
      'Separa primero lo fijo (transporte, comida, materiales) y recién después lo libre.',
      'Evita las cuotas de consumo: con ingreso chico pesan mucho más.',
    ],
  },
]

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()

export function professionGroup(profession: string): Group | null {
  const t = ` ${strip(profession)} `
  if (t.trim().length < 3) return null
  return GROUPS.find((g) => g.words.some((w) => t.includes(w.endsWith(' ') ? ` ${w}` : w))) ?? null
}

export interface ProfileAdvice {
  groupLabel: string | null
  /** Meses de gasto que conviene tener guardados para imprevistos */
  emergencyMonths: number
  /** Porcentaje del sueldo que conviene ahorrar */
  savingsTargetPct: number
  variableIncome: boolean
  tips: string[]
}

export function adviceFor(
  p: (Pick<Profile, 'profession' | 'employment' | 'dependents'> & { birth_date?: string | null }) | null | undefined,
  now: Date = new Date(),
): ProfileAdvice {
  const employment = (p?.employment ?? 'dependiente') as Employment
  const group = professionGroup(p?.profession ?? '')
  const dependents = p?.dependents ?? 0
  const selfEmployed = employment === 'independiente' || employment === 'honorarios'
  const variableIncome = selfEmployed || (group?.variable ?? false) || employment === 'estudiante'

  let months = { dependiente: 3, independiente: 6, honorarios: 6, estudiante: 2, otro: 4 }[employment]
  if (!selfEmployed && group?.variable) months += 1
  if (dependents >= 1) months += 1
  if (dependents >= 3) months += 1
  months = Math.min(months, 9)

  const savingsTargetPct = selfEmployed ? 20 : employment === 'estudiante' ? 10 : 15

  const tips: string[] = []
  if (group) tips.push(...group.tips)
  if (employment === 'honorarios') {
    tips.push(
      'En boletas de honorarios se retiene un porcentaje del bruto (en 2026 es 15,25 %, referencial). Anota aquí tu sueldo líquido y aparta algo para el impuesto anual.',
    )
  }
  if (employment === 'independiente') {
    tips.push('Separa tu plata personal de la del negocio y págate un sueldo fijo cada mes.')
  }
  if (variableIncome) {
    tips.push(`Como tu ingreso varía, apunta a tener ${months} meses de gastos guardados.`)
  }
  if (dependents > 0) {
    tips.push(
      `Con ${dependents} ${dependents === 1 ? 'persona a cargo' : 'personas a cargo'} suma un mes extra de ahorro para imprevistos y revisa un seguro de vida o de salud.`,
    )
  }
  const age = p?.birth_date ? ageOn(p.birth_date, now) : null
  const stage = age === null ? null : lifeStageTip(age)
  if (stage) tips.push(stage)
  if (tips.length === 0) {
    tips.push('Cuéntanos tu profesión y situación laboral para darte consejos a tu medida.')
  }
  return { groupLabel: group?.label ?? null, emergencyMonths: months, savingsTargetPct, variableIncome, tips }
}
