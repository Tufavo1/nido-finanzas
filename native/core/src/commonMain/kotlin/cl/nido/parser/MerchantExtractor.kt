// Copyright (c) 2026 Dinovance
package cl.nido.parser

internal object MerchantExtractor {
    private const val MAX_LENGTH = 60

    // "en TIENDA ..." o "a Empresa ..." despues del monto.
    private val AFTER_AMOUNT = Regex("(?:^|\\s)(?:en|a)\\s+(.+)", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    // "Transferencia realizada a Juana por $20.000": el nombre va ANTES del monto.
    private val BEFORE_AMOUNT = Regex("\\ba\\s+(?!las\\b)(.+?)\\s+por\\s*$", RegexOption.IGNORE_CASE)
    private val NOT_A_NAME = Regex("^(\\d+\\s+(?:cuotas?|pagos?)\\b|\\d+$|tu\\b|su\\b|cuotas?\\b)", RegexOption.IGNORE_CASE)

    // Donde termina el nombre: fecha, "con tu tarjeta", "por", puntuacion final de frase, salto de linea.
    private val END_OF_NAME = Regex(
        listOf(
            "\\s+el\\s+\\d",
            "\\s+con\\s+(?:tu|su)\\b",
            "\\s+a\\s+las\\b",
            "\\s+desde\\b",
            "\\s+terminada\\b",
            "\\s+por\\b",
            "\\s+\\d{1,2}[/-]\\d{1,2}",
            "[.,;:](?:\\s|$)",
            "\\n",
        ).joinToString("|"),
        RegexOption.IGNORE_CASE,
    )

    // «Pagaste $100 a tu CMR Mastercard Premium»: no hay comercio, el aviso solo nombra la tarjeta. Para CMR se usa un nombre fijo
    // y estable (así la categoría se aprende una vez); con otras tarjetas no se inventa nada.
    // Los avisos de CMR cierran con «Ciudad Chl» (Santiago Chl): se quita para que el comercio sea estable. Solo si «Chl» es la ultima palabra.
    private val CITY_COUNTRY = Regex("\\s+\\S+\\s+chl$", RegexOption.IGNORE_CASE)
    private val CMR_CARD = Regex("^(?:tu|su)\\s+cmr\\b", RegexOption.IGNORE_CASE)
    const val CMR_MERCHANT = "Compra con CMR"

    fun find(before: String, after: String, isTransfer: Boolean): String? {
        val candidate = fromAfter(after) ?: if (isTransfer) fromBefore(before) else null
        if (candidate != null && CMR_CARD.containsMatchIn(candidate)) return CMR_MERCHANT
        return candidate?.takeIf { it.isNotEmpty() && !NOT_A_NAME.containsMatchIn(it) }
    }

    private fun fromAfter(after: String): String? =
        AFTER_AMOUNT.find(after)?.let { clean(cutAtEnd(it.groupValues[1])) }

    private fun fromBefore(before: String): String? =
        BEFORE_AMOUNT.find("${before.trimEnd()} ")?.let { clean(it.groupValues[1]) }

    private fun cutAtEnd(rest: String): String = END_OF_NAME.find(rest)?.let { rest.substring(0, it.range.first) } ?: rest

    private fun clean(raw: String): String {
        val name0 = UnsafeChars.strip(raw.map { if (it == '\t' || it == '\r' || it == '\n' || it.category == CharCategory.SPACE_SEPARATOR) ' ' else it }.joinToString("")).replace(Regex("\\s+"), " ").trim().trimEnd('.', ',', ';', ':')
        val name = CITY_COUNTRY.replace(name0, "").ifEmpty { name0 }
        val readable = if (isAllCaps(name)) toTitleCase(name) else name
        return readable.take(MAX_LENGTH)
    }

    private fun isAllCaps(s: String) = s.any { it.isLetter() } && s == s.uppercase()

    // "LIDER EXPRESS" -> "Lider Express"; tras guion tambien ("PIZZA-DEMO" -> "Pizza-Demo").
    private fun toTitleCase(s: String): String {
        val out = StringBuilder(s.length)
        var startOfWord = true
        for (c in s.lowercase()) {
            out.append(if (startOfWord && c.isLetter()) c.titlecaseChar() else c)
            startOfWord = c == ' ' || c == '-'
        }
        return out.toString()
    }
}
