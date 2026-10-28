import type { Finding } from './finance'
import { money } from './format'

export interface FixedItem {
  note: string
  amount: number
  category: string
  /** Días que faltan para el próximo pago */
  left: number
}

/**
 * Lectura de los gastos fijos activos: cuánto pesan en el sueldo, cuál es el más grande, dónde se concentran,
 * cuánto vence pronto y cuánto suman al año. `income` es 0 si no hay sueldo anotado y `null` si no tiene sentido compararlo (por ejemplo, fijos de los dos).
 */
export function analyzeFixed(items: FixedItem[], income: number | null): Finding[] {
  const total = items.reduce((s, x) => s + x.amount, 0)
  if (total <= 0) return []
  const out: Finding[] = []

  if (income === null) {
    // sin comparación con el sueldo
  } else if (income > 0) {
    const pct = Math.round((total / income) * 100)
    out.push(
      pct > 50
        ? { level: 'bad', title: `Los fijos se llevan el **${pct} %** del sueldo`, detail: `Lo sano es no pasar de la mitad. Te queda ${money(Math.max(0, income - total))} para todo lo demás: revisa cuáles puedes bajar o cancelar.` }
        : pct > 35
          ? { level: 'warn', title: `Los fijos son el **${pct} %** del sueldo`, detail: `Está en el límite: queda ${money(income - total)} para comida, deudas y ahorro. Cualquier fijo nuevo aprieta el mes.` }
          : { level: 'ok', title: `Los fijos son solo el **${pct} %** del sueldo`, detail: `Tienes aire: quedan ${money(income - total)} para vivir, pagar deudas y ahorrar.` },
    )
  } else {
    out.push({ level: 'warn', title: 'Anota tu sueldo para medir su peso', detail: 'Con tu sueldo puedo decirte qué porcentaje se va en fijos y si está sano.' })
  }

  const top = items.reduce((a, b) => (b.amount > a.amount ? b : a))
  const topPct = Math.round((top.amount / total) * 100)
  if (items.length > 1 && topPct >= 50) {
    out.push({ level: 'warn', title: `**${top.note}** es el ${topPct} % de tus fijos`, detail: `Un solo gasto de ${money(top.amount)} al mes pesa tanto como todos los demás juntos; negociarlo es lo que más te ahorra.` })
  }

  const byCat = new Map<string, number>()
  for (const x of items) byCat.set(x.category, (byCat.get(x.category) ?? 0) + x.amount)
  const [catName, catSum] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]
  if (byCat.size > 1) {
    out.push({ level: 'ok', title: `Donde más se va: **${catName}**`, detail: `${money(catSum)} al mes, el ${Math.round((catSum / total) * 100)} % de tus fijos.` })
  }

  const soon = items.filter((x) => x.left <= 7)
  if (soon.length > 0) {
    const sum = soon.reduce((s, x) => s + x.amount, 0)
    out.push({ level: 'ok', title: `Esta semana vencen **${money(sum)}**`, detail: soon.map((x) => x.note).join(', ') + '. Ten ese dinero disponible.' })
  }

  out.push({ level: 'ok', title: `Al año suman **${money(total * 12)}**`, detail: `Son ${money(Math.round(total / 30))} por día solo en gastos que se repiten; un fijo de menos se nota todo el año.` })
  return out
}
