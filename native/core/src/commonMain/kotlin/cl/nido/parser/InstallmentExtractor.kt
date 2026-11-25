// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * Lectura de un aviso en cuotas: [amount] es lo que se registra (el TOTAL de una compra nueva o, si no se sabe, una cuota),
 * [installment] solo cuando [amount] es UNA cuota, y [ambiguous] cuando hay otros montos o no se supo el total.
 */
internal data class InstallmentReading(val amount: MoneyToken, val installment: Installment?, val plan: InstallmentPlan, val ambiguous: Boolean)

/**
 * Decision del dueno (2026-11-24): una compra en cuotas con tarjeta de credito se registra por el TOTAL (lo que se debe y lo que usa
 * del cupo) y nunca se guarda sola; el numero y el valor de las cuotas se conservan como dato. El cobro de una cuota de una compra
 * anterior («Cuota 2 de 6 por $15.000») NO es una compra nueva. El total no se inventa: sin total informado queda la cuota, ambigua.
 */
internal object InstallmentExtractor {
    private const val MAX_INSTALLMENTS = 120
    private const val MIN_PLAN = 2
    // "Cuota 2 de 6": la cuota n de un total de N
    private val N_OF_TOTAL = Regex("\\bcuota\\s+(\\d{1,3})\\s+de\\s+(\\d{1,3})\\b", RegexOption.IGNORE_CASE)
    private val FIRST = Regex("\\bprimera\\s+cuota\\b", RegexOption.IGNORE_CASE)
    private val TOTAL_COUNT = Regex("\\b(\\d{1,3})\\s+cuotas\\b", RegexOption.IGNORE_CASE)
    // "en 3 cuotas de $10.000", "3 cuotas sin interés de $10.000", "3 cuotas mensuales de": el monto que sigue es CADA cuota.
    private val COUNT_OF_VALUE = Regex(
        "\\b(\\d{1,3})\\s+cuotas\\s+(?:(?:mensuales|sin\\s+inter[eé]s)\\s+){0,2}de\\s*(?=\\$|clp\\b)", RegexOption.IGNORE_CASE,
    )

    /** null = el aviso no es en cuotas (o es en 1 cuota): se lee como siempre. [tokens] en orden de aparicion. */
    fun read(text: String, tokens: List<MoneyToken>): InstallmentReading? {
        if (tokens.isEmpty()) return null
        val explicit = N_OF_TOTAL.find(text)?.takeIf { m -> valid(m.groupValues[1].toInt(), m.groupValues[2].toInt()) }
        // «Cuota 2 de 6 cuotas»: el «6 cuotas» es parte de la cuota explicita, no otra frase de compra
        val counted = TOTAL_COUNT.findAll(text).firstOrNull { m ->
            m.groupValues[1].toInt() in MIN_PLAN..MAX_INSTALLMENTS && explicit?.range?.contains(m.range.first) != true
        }
        val ofValue = COUNT_OF_VALUE.find(text)?.takeIf { it.groupValues[1].toInt() in MIN_PLAN..MAX_INSTALLMENTS }
        val count = ofValue?.groupValues?.get(1)?.toInt() ?: explicit?.groupValues?.get(2)?.toInt() ?: counted?.groupValues?.get(1)?.toInt()
        if (count == null || count < MIN_PLAN) return null
        // Desde donde viene el valor de la cuota
        val valueFrom = ofValue?.range?.last?.plus(1) ?: explicit?.range?.last?.plus(1) ?: FIRST.find(text)?.takeIf { counted != null }?.range?.last?.plus(1)
        val valueToken = valueFrom?.let { from -> tokens.firstOrNull { it.start >= from } }
        val distinct = tokens.map { it.amountClp }.distinct().size
        if (explicit != null && counted == null && ofValue == null) return priorCharge(explicit, count, valueToken ?: tokens.first(), distinct)
        val markerStart = listOfNotNull(ofValue?.range?.first, explicit?.range?.first, counted?.range?.first).min()
        val total = tokens.firstOrNull { it !== valueToken }
        val cuota = valueToken?.amountClp
        val plan = InstallmentPlan(InstallmentRole.PURCHASE, count, cuota)
        if (total != null && (cuota == null || isTotal(total, cuota, count, markerStart))) {
            val known = setOfNotNull(total.amountClp, cuota)
            return InstallmentReading(total, null, plan, tokens.any { it.amountClp !in known })
        }
        // Sin total creible: queda la cuota (no se multiplica: puede haber intereses o pie) y la persona decide
        val charged = valueToken ?: tokens.first()
        return InstallmentReading(charged, Installment(1, count), plan.copy(valueClp = charged.amountClp), ambiguous = true)
    }

    /** «Cuota 2 de 6 por $15.000» sin frase de compra: cobro de una cuota de una compra ya anotada. */
    private fun priorCharge(m: MatchResult, count: Int, charged: MoneyToken, distinct: Int) = InstallmentReading(
        charged, Installment(m.groupValues[1].toInt(), count), InstallmentPlan(InstallmentRole.PRIOR_CHARGE, count, charged.amountClp), distinct > 1,
    )

    /**
     * [total] es el total de la compra si aparece ANTES de las cuotas («$30.000 en 3 cuotas de $10.000», con o sin intereses) o si calza
     * con cuotas × valor (tolerancia de 1 peso por cuota por redondeo: «en 3 cuotas por $45.000. Primera cuota: $15.000»).
     */
    private fun isTotal(total: MoneyToken, cuota: Long, count: Int, markerStart: Int): Boolean {
        if (total.amountClp <= cuota) return false
        return total.start < markerStart || kotlin.math.abs(total.amountClp - cuota * count) <= count
    }

    private fun valid(n: Int, total: Int) = total in 1..MAX_INSTALLMENTS && n in 1..total
}
