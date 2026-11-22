// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * Medio de pago o cuenta que nombra el aviso: «Con tu Debito Banco Falabella», «a tu CMR Mastercard Premium»,
 * «Con tu CMR ... Terminada en 5766», «a tu Cuenta Banco Falabella 2236». Solo se conserva el nombre y los ULTIMOS 4 digitos:
 * jamas un numero completo ni texto del aviso (privacidad).
 */
internal object AccountExtractor {
    private const val MAX_LENGTH = 60
    private val AFTER = Regex("\\b(con|a|en)\\s+(?:tu|su)\\s+(.+)", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    // «en tu app» no es una cuenta: con «en» solo vale si sigue un medio de pago
    private val EN_OK = Regex("^(?:cuenta|tarjeta|cmr|debito|credito|linea)\\b", RegexOption.IGNORE_CASE)
    private val END = Regex("\\s+terminada\\s+en\\b|\\s+si\\s+no\\b|\\s+revisa\\b|\\s+llama\\b|\\s+mas\\s+detalles\\b|[.!?;\\n]|$", RegexOption.IGNORE_CASE)
    private val TERMINADA = Regex("^\\s*terminada\\s+en\\s+[^0-9]{0,4}(\\d{4,})", RegexOption.IGNORE_CASE)
    private val TRAILING_NUMBER = Regex("\\s+(\\d{4,})$")
    private val ACCENTED = mapOf("debito" to "Débito", "credito" to "Crédito")

    fun find(body: String): String? {
        val rest = AFTER.findAll(body).firstNotNullOfOrNull { m ->
            val tail = m.groupValues[2]
            if (m.groupValues[1].equals("en", ignoreCase = true) && !EN_OK.containsMatchIn(tail)) null else tail
        } ?: return null
        val cut = END.find(rest)
        var name = (if (cut != null) rest.substring(0, cut.range.first) else rest).trim()
        val tail = if (cut != null) rest.substring(cut.range.first) else ""
        // «Terminada en 5766» va despues del nombre; «Cuenta Banco Falabella 2236» lo trae pegado. Siempre los ULTIMOS 4.
        var digits = TERMINADA.find(tail)?.groupValues?.get(1)?.takeLast(4)
        if (digits == null) {
            val m = TRAILING_NUMBER.find(name)
            if (m != null) { digits = m.groupValues[1].takeLast(4); name = name.substring(0, m.range.first).trim() }
        }
        // Nada mas con digitos ni marcas de etiqueta en el nombre (otro numero largo, «<b>»...)
        name = UnsafeChars.strip(name).replace(Regex("[<>\"\\\\{}]"), "").split(Regex("\\s+")).filter { w -> w.isNotEmpty() && w.none { it.isDigit() } }.joinToString(" ").trim()
        if (name.isEmpty() || name.length > MAX_LENGTH || name.split(' ').size > 6) return null
        val pretty = name.split(' ').joinToString(" ") { pretty(it) }
        return if (digits != null) "$pretty ·$digits" else pretty
    }

    // Siglas cortas en mayusculas (CMR) se respetan; el resto queda «Titulo» aunque venga «PRemium».
    private fun pretty(w: String): String {
        if (w.length <= 3 && w == w.uppercase() && w.any { it.isLetter() }) return w
        val low = w.lowercase()
        return ACCENTED[low] ?: low.replaceFirstChar { it.titlecaseChar() }
    }
}
