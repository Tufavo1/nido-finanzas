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
    // «$ 12.990» puede traer un espacio duro (U+00A0) o angosto (U+202F) entre el signo y el numero.
    private const val GAP = "[\\s\u00a0\u202f]*"
    private val PATTERNS = listOf(
        Regex("\\$$GAP$DIGITS"),
        Regex("\\bCLP$GAP$DIGITS", RegexOption.IGNORE_CASE),
        Regex("\\b$DIGITS\\s*pesos\\b", RegexOption.IGNORE_CASE),
        Regex("\\b$DIGITS\\s*CLP\\b", RegexOption.IGNORE_CASE),
    )

    // «CLP 20,000» (Billetera Google, formato en-US): COMA de miles. Solo con la marca CLP explicita (el peso no tiene decimales, asi
    // que no es ambiguo); grupos exactos de 3 digitos y sin decimales detras («CLP 20,000.50» o «CLP 20,00» no dan monto).
    private const val COMMA_GROUPED = "(\\d{1,3}(?:,\\d{3})+)(?!\\d|[.,]\\d)"
    private val CLP_COMMA_PREFIX = Regex("\\bCLP$GAP$COMMA_GROUPED", RegexOption.IGNORE_CASE)
    // Sufijo en la MISMA linea («20,000 CLP»); el numero no puede venir pegado a otro.
    private val CLP_COMMA_SUFFIX = Regex("(?<![\\d.,])$COMMA_GROUPED[ \u00a0\u202f]*CLP\\b", RegexOption.IGNORE_CASE)
    // «$ 20,000» con coma de miles SOLO en el estilo Wallet: en un aviso de banco chileno «$12,990» sigue siendo ambiguo (H-09).
    private val DOLLAR_COMMA = Regex("\\$$GAP$COMMA_GROUPED")
    // Estilo Wallet: el sufijo «N CLP» solo en la misma linea (titulo y texto se juntan con salto de linea: «Shell 1828\nCLP 20,000»).
    private val WALLET_SUFFIX_DIGITS = Regex("(?<![\\d.,])\\b$DIGITS[ \u00a0\u202f]*CLP\\b", RegexOption.IGNORE_CASE)

    /** Todos los montos validos (> 0 y bajo el limite), en orden de aparicion. */
    fun findAll(text: String): List<MoneyToken> =
        (PATTERNS.flatMap { it.findAll(text).mapNotNull { m -> toToken(m, text) } } +
            listOf(CLP_COMMA_PREFIX, CLP_COMMA_SUFFIX).flatMap { it.findAll(text).mapNotNull { m -> commaToken(m) } })
            .let(::firstWins)

    /**
     * Estilo Billetera Google: ademas acepta «$ 20,000», rechaza cualquier decimal («CLP 20,00», «CLP 20.000,50») y, si un monto con la
     * marca DELANTE («CLP 20,000») choca con uno con la marca DETRAS («Shell Vespucio 1828 CLP 20,000» -> «1828 CLP»), gana el primero.
     */
    fun findAllWallet(text: String): List<MoneyToken> {
        val prefix = listOf(PATTERNS[0], PATTERNS[1]).flatMap { it.findAll(text).mapNotNull { m -> toToken(m, text, strict = true) } } +
            listOf(CLP_COMMA_PREFIX, DOLLAR_COMMA).flatMap { it.findAll(text).mapNotNull { m -> commaToken(m) } }
        val suffix = (listOf(PATTERNS[2], WALLET_SUFFIX_DIGITS).flatMap { it.findAll(text).mapNotNull { m -> toToken(m, text, strict = true) } } +
            CLP_COMMA_SUFFIX.findAll(text).mapNotNull { m -> commaToken(m) }.toList())
            .filter { s -> prefix.none { p -> s.start < p.end && p.start < s.end } }
        return firstWins(prefix + suffix)
    }

    // «$6.778 CLP»: un solo monto
    private fun firstWins(tokens: List<MoneyToken>): List<MoneyToken> =
        tokens.sortedBy { it.start }.fold(ArrayList()) { acc, t -> if (acc.isNotEmpty() && t.start < acc.last().end) acc else acc.apply { add(t) } }

    private fun commaToken(match: MatchResult): MoneyToken? {
        val amount = match.groupValues[1].replace(",", "").toLongOrNull()?.takeIf(ClpAmount::isValid) ?: return null
        return MoneyToken(amount, match.range.first, match.range.last + 1)
    }

    private val ANY_DECIMALS = Regex("^[.,]\\d")

    private fun toToken(match: MatchResult, text: String, strict: Boolean = false): MoneyToken? {
        if (COMMA_THOUSANDS.containsMatchIn(text.substring(match.groups[1]!!.range.last + 1))) return null
        val digits = match.groupValues[1]
        val rest = text.substring(match.groups[1]!!.range.last + 1)
        if (strict && ANY_DECIMALS.containsMatchIn(rest)) return null
        val plain = digits.none { it == '.' || it == ' ' || it == '\u00a0' }
        if (plain && AMBIGUOUS_DECIMALS.containsMatchIn(rest) && !ZERO_CENTS.containsMatchIn(rest)) return null
        val amount = ClpAmount.parse(match.groupValues[1].replace(" ", "").replace("\u00a0", "")) ?: return null
        return MoneyToken(amount, match.range.first, match.range.last + 1)
    }
}
