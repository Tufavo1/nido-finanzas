// Copyright (c) 2026 Dinovance
package cl.nido.parser

/** Un monto en pesos hallado en el texto, con su posicion para leer lo que viene despues. */
internal data class MoneyToken(val amountClp: Long, val start: Int, val end: Int)

internal object MoneyExtractor {
    /** Limite de la columna amount de la base: el monto debe ser menor. */
    const val MAX_AMOUNT_CLP = ClpAmount.MAX_EXCLUSIVE

    // Enteros con puntos de miles ("1.250.000") o sin ellos ("4500"); los centavos (",50") se ignoran.
    // Tambien "12 990" (espacio de miles, normal o duro); un solo tipo de separador por monto.
    private const val DIGITS = "(\\d{1,3}(?:\\.\\d{3})+|\\d{1,3}(?:[ \u00a0]\\d{3})+(?!\\d)|\\d+)(?:,\\d{1,2})?"
    // "\$12,990" es ambiguo (coma de miles o centavos): no se adivina, se descarta (H-09).
    private val COMMA_THOUSANDS = Regex("^,\\d{3}(?!\\d)")
    // "$12,99", "$12.99", "$12,5": decimales de estilo extranjero (un monto en dolares sin marca) o ambiguos. No se adivina (R2-09).
    private val AMBIGUOUS_DECIMALS = Regex("^[.,]\\d{1,2}(?!\\d)")
    private val ZERO_CENTS = Regex("^[.,]0{1,2}(?!\\d)")
    private val PATTERNS = listOf(
        Regex("\\$\\s*$DIGITS"),
        Regex("\\bCLP\\s*$DIGITS", RegexOption.IGNORE_CASE),
        Regex("\\b$DIGITS\\s*pesos\\b", RegexOption.IGNORE_CASE),
        Regex("\\b$DIGITS\\s*CLP\\b", RegexOption.IGNORE_CASE),
    )

    /** Todos los montos validos (> 0 y bajo el limite), en orden de aparicion. */
    fun findAll(text: String): List<MoneyToken> =
        PATTERNS.flatMap { it.findAll(text).mapNotNull { m -> toToken(m, text) } }.sortedBy { it.start }
            .fold(ArrayList<MoneyToken>()) { acc, t -> if (acc.isNotEmpty() && t.start < acc.last().end) acc else acc.apply { add(t) } } // «$6.778 CLP»: un solo monto

    private fun toToken(match: MatchResult, text: String): MoneyToken? {
        if (COMMA_THOUSANDS.containsMatchIn(text.substring(match.groups[1]!!.range.last + 1))) return null
        val digits = match.groupValues[1]
        val rest = text.substring(match.groups[1]!!.range.last + 1)
        val plain = digits.none { it == '.' || it == ' ' || it == '\u00a0' }
        if (plain && AMBIGUOUS_DECIMALS.containsMatchIn(rest) && !ZERO_CENTS.containsMatchIn(rest)) return null
        val amount = ClpAmount.parse(match.groupValues[1].replace(" ", "").replace("\u00a0", "")) ?: return null
        return MoneyToken(amount, match.range.first, match.range.last + 1)
    }
}
