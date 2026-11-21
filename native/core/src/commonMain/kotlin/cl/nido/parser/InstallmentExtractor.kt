// Copyright (c) 2026 Dinovance
package cl.nido.parser

/** Cuota detectada y el punto del texto desde el cual aparece el monto de ESA cuota. */
internal data class InstallmentInfo(val installment: Installment, val markerEnd: Int)

internal object InstallmentExtractor {
    private const val MAX_INSTALLMENTS = 120
    private val N_OF_TOTAL = Regex("\\bcuota\\s+(\\d{1,3})\\s+de\\s+(\\d{1,3})\\b", RegexOption.IGNORE_CASE)
    private val FIRST = Regex("\\bprimera\\s+cuota\\b", RegexOption.IGNORE_CASE)
    private val TOTAL_COUNT = Regex("\\b(\\d{1,3})\\s+cuotas\\b", RegexOption.IGNORE_CASE)

    fun find(text: String): InstallmentInfo? = explicit(text) ?: firstOfTotal(text)

    // "Cuota 1 de 6: $10.000"
    private fun explicit(text: String): InstallmentInfo? {
        val m = N_OF_TOTAL.find(text) ?: return null
        return build(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.range.last + 1)
    }

    // "en 3 cuotas ... Primera cuota: $15.000"
    private fun firstOfTotal(text: String): InstallmentInfo? {
        val first = FIRST.find(text) ?: return null
        val total = TOTAL_COUNT.find(text)?.groupValues?.get(1)?.toInt() ?: return null
        return build(1, total, first.range.last + 1)
    }

    private fun build(n: Int, total: Int, markerEnd: Int): InstallmentInfo? =
        if (total in 1..MAX_INSTALLMENTS && n in 1..total) InstallmentInfo(Installment(n, total), markerEnd) else null
}
