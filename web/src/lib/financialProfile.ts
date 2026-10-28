import type { Analysis, ScorePart } from './analysis'
import type { Numbers } from './numbers'
import type { Level } from './finance'
import { money } from './format'

/** Perfil financiero: quién eres con la plata hoy, en qué nivel vas y qué hacer para subir. Todo sale del análisis. */
export type ProfileKey = 'rescate' | 'deudas' | 'gustos' | 'justo' | 'equilibrado' | 'ahorrador' | 'solido'

export interface Trait {
  key: ScorePart['key']
  label: string
  /** 0 a 100 */
  pct: number
  level: Level
  detail: string
}

export interface RoadStep {
  when: 'Esta semana' | 'Este mes' | 'En 3 meses'
  title: string
  detail: string
}

export interface FinancialProfile {
  key: ProfileKey
  name: string
  mark: string
  tagline: string
  description: string
  /** 1 a 5 */
  level: number
  levelName: string
  /** Puntos que faltan para el siguiente nivel; null en el último */
  toNext: number | null
  score: number
  traits: Trait[]
  strengths: string[]
  toImprove: string[]
  steps: RoadStep[]
  motivation: string
}

export type ProfileResult = { ready: false; missing: string[] } | { ready: true; profile: FinancialProfile }

export const LEVELS = ['Punto de partida', 'Tomando el control', 'Equilibrio', 'Construyendo futuro', 'Libertad en camino'] as const
const LEVEL_FLOORS = [0, 30, 50, 65, 80]

export function levelFor(score: number): { level: number; name: string; toNext: number | null } {
  let level = 1
  LEVEL_FLOORS.forEach((floor, i) => {
    if (score >= floor) level = i + 1
  })
  return { level, name: LEVELS[level - 1], toNext: level < 5 ? LEVEL_FLOORS[level] - score : null }
}

const ARCHETYPES: Record<ProfileKey, { name: string; mark: string; tagline: string; description: string; motivation: string }> = {
  rescate: {
    name: 'En modo rescate',
    mark: '🛟',
    tagline: 'Hoy sale más plata de la que entra',
    description:
      'Tus gastos y cuotas superan lo que ganas, así que el mes cierra en rojo. No es una condena: es el punto de partida más claro para actuar, porque cada peso que recortes o sumes se nota enseguida.',
    motivation:
      'Casi todo el mundo pasa por un mes en rojo alguna vez. Lo que marca la diferencia es mirarlo de frente, como estás haciendo ahora. Un solo ajuste bien elegido ya cambia la dirección.',
  },
  deudas: {
    name: 'Reconstruyendo (salir de deudas)',
    mark: '🧗',
    tagline: 'Las cuotas se llevan buena parte de tu sueldo',
    description:
      'Gran parte de lo que ganas va a pagar deudas, lo que deja poco espacio para ahorrar. Tu prioridad es bajar las cuotas o el interés para recuperar aire.',
    motivation:
      'Cada cuota que terminas libera plata para ti. Las deudas se acaban: con un plan y constancia, lo que hoy pesa mucho mañana será ahorro.',
  },
  gustos: {
    name: 'Disfrutador/a',
    mark: '🎈',
    tagline: 'Los gustos pesan más de lo recomendado',
    description:
      'Tienes ingresos que alcanzan, pero buena parte se va en gustos y poco queda para ahorrar. Con pequeños ajustes en lo no esencial, el ahorro aparece sin sacrificar todo lo que disfrutas.',
    motivation:
      'No se trata de dejar de disfrutar, sino de elegir mejor. Basta con mover una parte pequeña de los gustos al ahorro para cambiar tu año.',
  },
  justo: {
    name: 'Al día, sin margen',
    mark: '🧭',
    tagline: 'Llegas a fin de mes, pero casi no te sobra',
    description:
      'Cubres tus gastos y cuotas, aunque queda poco o nada al final. Cualquier imprevisto puede desordenarte, así que el foco es crear un pequeño margen.',
    motivation:
      'Estás a un paso de lograrlo: ya tienes el hábito de llegar a fin de mes. Ahora solo falta sumar un ahorro, aunque sea pequeño, y mantenerlo.',
  },
  equilibrado: {
    name: 'Equilibrado/a',
    mark: '⚖️',
    tagline: 'Gastas con orden y ya ahorras algo',
    description:
      'Tus gastos, tus deudas y tu ahorro están en una proporción sana. Tienes una base firme para pensar en metas más grandes.',
    motivation:
      'Lo difícil ya lo hiciste: ordenarte. Ahora cada mejora, por pequeña que sea, se acumula sobre una base sólida.',
  },
  ahorrador: {
    name: 'Ahorrador/a constante',
    mark: '🌱',
    tagline: 'Apartas una buena parte de lo que ganas',
    description:
      'Ahorras de forma sostenida y tus deudas están bajo control. Tu desafío ahora es que ese ahorro esté bien protegido y trabaje para tus metas.',
    motivation:
      'Tu constancia es tu mejor activo. Con un destino claro para cada peso ahorrado, vas a llegar más rápido de lo que imaginas.',
  },
  solido: {
    name: 'Financieramente sólido',
    mark: '🏔️',
    tagline: 'Ahorras, debes poco y tienes colchón',
    description:
      'Tu panorama es muy bueno: ahorro alto, deudas bajas y un colchón para imprevistos. Puedes pensar en objetivos de largo plazo con tranquilidad.',
    motivation:
      'Llegaste a un nivel que mucha gente busca por años. Sigue cuidando lo que construiste y ponlo al servicio de tus metas grandes.',
  },
}

function traitsFrom(a: Analysis): Trait[] {
  return (a.score?.parts ?? []).map((p) => ({
    key: p.key,
    label: p.label,
    pct: p.max > 0 ? Math.round((p.points * 100) / p.max) : 0,
    level: p.level,
    detail: p.detail,
  }))
}

function pickKey(a: Analysis, n: Numbers, score: number): ProfileKey {
  const f = n.flow
  const savings = f?.savingsPct ?? 0
  const debtsPct = f?.per100.debts ?? 0
  const wants = a.rule && a.rule.income > 0 ? Math.round((a.rule.wants * 100) / a.rule.income) : 0
  if (f && (f.over || f.outlook < 0)) return 'rescate'
  if (debtsPct >= 40) return 'deudas'
  if (score >= 80 && savings >= 20 && debtsPct < 15) return 'solido'
  if (savings >= 20 && debtsPct < 30) return 'ahorrador'
  if (wants > 40 && savings < 10) return 'gustos'
  if (savings >= 10) return 'equilibrado'
  return 'justo'
}

function stepsFor(a: Analysis, n: Numbers, traits: Trait[]): RoadStep[] {
  const f = n.flow
  const income = f?.income ?? 0
  const steps: RoadStep[] = []
  const weakest = [...traits].sort((x, y) => x.pct - y.pct)

  for (const t of weakest) {
    if (steps.length >= 3) break
    if (t.pct >= 85) continue
    if (t.key === 'ahorro' && income > 0) {
      const current = Math.max(0, f?.savingsPct ?? 0)
      const missing = Math.max(0, Math.round((income * (20 - current)) / 100))
      steps.push({
        when: steps.length === 0 ? 'Esta semana' : 'Este mes',
        title: current >= 20 ? 'Mantén tu ahorro' : `Sube tu ahorro de ${current} % a 20 %`,
        detail:
          current >= 20
            ? 'Automatiza el aporte el día que te pagan para que no dependa de la voluntad.'
            : `Te faltan unos ${money(missing)} al mes. Parte con la mitad y aparta esa plata el mismo día que te pagan.`,
      })
    } else if (t.key === 'deudas') {
      const pct = f?.per100.debts ?? 0
      steps.push({
        when: steps.length === 0 ? 'Esta semana' : 'Este mes',
        title: pct >= 15 ? `Baja el peso de tus cuotas (hoy ${pct} % del sueldo)` : 'Mantén tus deudas controladas',
        detail:
          pct >= 15
            ? 'Revisa en Deudas el orden de pago recomendado, compara tasas y evalúa renegociar la más cara.'
            : 'Sigue pagando a tiempo y evita tomar deuda nueva mientras no sea necesaria.',
      })
    } else if (t.key === 'colchon') {
      const months = a.cushionMonths ?? 0
      const missing = Math.max(0, Math.round((3 - months) * a.cost))
      steps.push({
        when: steps.length === 0 ? 'Esta semana' : 'En 3 meses',
        title: months >= 3 ? 'Llega a 6 meses de colchón' : 'Arma tu ahorro para imprevistos',
        detail:
          months >= 3
            ? 'Ya cubres más de 3 meses. Si puedes, apunta a 6 meses de gastos.'
            : `Hoy cubres ${months.toLocaleString('es-CL', { maximumFractionDigits: 1 })} meses. Para llegar a 3 te faltan unos ${money(missing)}: crea una meta "Imprevistos" y aporta cada mes.`,
      })
    } else if (t.key === 'presupuesto') {
      steps.push({
        when: steps.length === 0 ? 'Esta semana' : 'Este mes',
        title: 'Ponle tope a tus categorías',
        detail: 'En Gastos define un tope mensual para supermercado, transporte y ocio. Es la forma más simple de no pasarte sin darte cuenta.',
      })
    }
  }
  // Si ya va bien en todo, se completan los tres pasos con hábitos que sostienen el progreso
  const habits: RoadStep[] = [
    {
      when: 'En 3 meses',
      title: 'Ponle un destino a tu ahorro',
      detail: 'Crea una meta concreta (viaje, vehículo, pie de una vivienda) y aporta a ella cada mes para que tu ahorro tenga propósito.',
    },
    {
      when: 'Este mes',
      title: 'Revisa tu mes cada semana',
      detail: 'Dedica 10 minutos a anotar gastos pendientes y mirar el Análisis. Lo que se mide, mejora.',
    },
    {
      when: 'Este mes',
      title: 'Revisa tus gastos fijos',
      detail: 'Una vez al trimestre mira suscripciones y planes: renegociar o cancelar uno libera plata sin cambiar tu día a día.',
    },
  ]
  for (const h of habits) if (steps.length < 3) steps.push(h)
  return steps.slice(0, 3)
}

export function buildFinancialProfile(a: Analysis | null, n: Numbers | null): ProfileResult {
  const missing: string[] = []
  if (!a || !a.hasData) missing.push('Registrar tus gastos del mes')
  if (!a?.score || !n?.flow) missing.push('Poner tu sueldo en Finanzas > Sueldo')
  if (!a || !a.score || !n || !n.flow) return { ready: false, missing }

  const score = a.score.value
  const key = pickKey(a, n, score)
  const base = ARCHETYPES[key]
  const lv = levelFor(score)
  const traits = traitsFrom(a)
  const strengths = traits.filter((t) => t.level === 'ok' && t.pct >= 70).map((t) => `${t.label}: ${t.detail}`)
  const toImprove = traits.filter((t) => t.level !== 'ok' || t.pct < 70).map((t) => `${t.label}: ${t.detail}`)

  return {
    ready: true,
    profile: {
      key,
      ...base,
      level: lv.level,
      levelName: lv.name,
      toNext: lv.toNext,
      score,
      traits,
      strengths,
      toImprove,
      steps: stepsFor(a, n, traits),
      motivation: base.motivation,
    },
  }
}
