// Copyright (c) 2026 Dinovance
package cl.nido.parser

internal object MerchantExtractor {
    private const val MAX_LENGTH = 60

    // "en TIENDA ..." o "a Empresa ..." despues del monto.
    private val AFTER_AMOUNT = Regex("(?:^|\\s)(?:en|a)\\s+(.+)", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    // Telefono en ingles (Billetera): «You paid CLP 7,000 at COPEC», «Paid CLP 7,000 to COPEC». Solo JUSTO tras el monto: en un aviso
    // en espanol «at»/«to» no son palabras, pero un comercio puede empezar asi («To Go Sushi»).
    private val AT_TO_AFTER_AMOUNT = Regex("^\\s*(?:at|to)\\s+(.+)", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    // "Transferencia realizada a Juana por $20.000": el nombre va ANTES del monto.
    private val BEFORE_AMOUNT = Regex("\\ba\\s+(?!las\\b)(.+?)\\s+por\\s*$", RegexOption.IGNORE_CASE)
    private val NOT_A_NAME = Regex("^(\\d+\\s+(?:cuotas?|pagos?)\\b|\\d+$|tu\\b|su\\b|cuotas?\\b)", RegexOption.IGNORE_CASE)

    /** Marca, tipo de tarjeta o mascara de digitos que sigue a «con» cuando el aviso nombra el medio de pago. */
    internal const val PAYMENT_MEDIUM =
        "(?:(?:(?:la|el|una?)\\s+)?(?:tarjeta|visa|master\\s?card|amex|american\\s+express|diners|redcompra|maestro|cmr|d[eéÉ]bito|cr[eéÉ]dito" +
            "|cuenta\\s?rut|google\\s+pay|g\\s?pay|billetera|google\\s+wallet|wallet|card|debit|credit)(?![a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ])|[•·*●∙‧…]+\\s*\\d)"

    // Donde termina el nombre: fecha, "con tu tarjeta", "por", puntuacion final de frase, salto de linea.
    private val END_OF_NAME = Regex(
        listOf(
            "\\s+el\\s+\\d",
            "\\s+con\\s+(?:tu|su)\\b",
            // «en COMERCIO con Visa •••• 1234», «con Mastercard 1234», «con CMR», «con la tarjeta», «con débito», «with Visa»: el medio de
            // pago no es parte del nombre. Solo con una marca o tipo de pago detras: «Pan con Palta» y «Ferretería Con Con» se quedan enteros.
            "\\s+(?:con|with|using)\\s+$PAYMENT_MEDIUM",
            "\\s+a\\s+las\\b",
            "\\s+desde\\b",
            "\\s+terminada\\b",
            "\\s+en\\s+\\d{1,3}\\s+cuotas?\\b",
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
    private val COMMUNES = listOf(
        "santiago", "las condes", "providencia", "nunoa", "la florida", "maipu", "puente alto", "san bernardo", "vitacura", "lo barnechea",
        "penalolen", "la reina", "macul", "san miguel", "estacion central", "quilicura", "huechuraba", "recoleta", "independencia", "conchali",
        "renca", "cerro navia", "pudahuel", "lo prado", "quinta normal", "cerrillos", "lampa", "colina", "pedro aguirre cerda", "san joaquin",
        "la cisterna", "el bosque", "la granja", "la pintana", "san ramon", "lo espejo", "padre hurtado", "penaflor", "talagante", "buin",
        "valparaiso", "vina del mar", "concon", "quilpue", "villa alemana", "concepcion", "talcahuano", "san pedro de la paz", "hualpen",
        "temuco", "antofagasta", "iquique", "arica", "la serena", "coquimbo", "rancagua", "talca", "chillan", "los angeles", "osorno",
        "puerto montt", "valdivia", "punta arenas", "copiapo", "calama", "curico", "linares", "quillota", "melipilla", "san antonio",
    ).sortedByDescending { it.length }
    // «Chl» tras cualquier palabra (formato de CMR). «CL» o «Chile» solo tras una comuna CONOCIDA («COPEC LAS CONDES SANTIAGO CL»):
    // «FARMACIA CL» se queda como esta.
    private val CITY_COUNTRY = Regex(
        "\\s+(?:${COMMUNES.joinToString("|")}|\\S+)\\s+chl$|\\s+(?:${COMMUNES.joinToString("|")})\\s+(?:cl|chile)$",
    )
    private val CMR_CARD = Regex("^(?:tu|su)\\s+cmr\\b", RegexOption.IGNORE_CASE)
    const val CMR_MERCHANT = "Compra con CMR"

    fun find(before: String, after: String, isTransfer: Boolean): String? {
        val candidate = fromAfter(after) ?: if (isTransfer) fromBefore(before) else null
        if (candidate != null && CMR_CARD.containsMatchIn(candidate)) return CMR_MERCHANT
        return candidate?.takeIf { it.isNotEmpty() && !NOT_A_NAME.containsMatchIn(it) }
    }

    private fun fromAfter(after: String): String? =
        (AT_TO_AFTER_AMOUNT.find(after) ?: AFTER_AMOUNT.find(after))?.let { clean(cutAtEnd(it.groupValues[1])) }

    private fun fromBefore(before: String): String? =
        BEFORE_AMOUNT.find("${before.trimEnd()} ")?.let { clean(it.groupValues[1]) }

    private fun cutAtEnd(rest: String): String = END_OF_NAME.find(rest)?.let { rest.substring(0, it.range.first) } ?: rest

    /** Limpieza comun del nombre (caracteres inseguros, espacios, ciudad final, MAYUSCULAS a Titulo, tope de largo). */
    internal fun clean(raw: String): String {
        val name0 = UnsafeChars.strip(raw.map { if (it == '\t' || it == '\r' || it == '\n' || it.category == CharCategory.SPACE_SEPARATOR) ' ' else it }.joinToString("")).replace(Regex("\\s+"), " ").trim().trimEnd('.', ',', ';', ':')
        val name = stripCity(name0)
        val readable = if (isAllCaps(name)) toTitleCase(name) else name
        return readable.take(MAX_LENGTH)
    }

    private fun stripCity(name: String): String {
        val m = CITY_COUNTRY.find(TextNormalizer.fold(name)) ?: return name
        return name.substring(0, m.range.first).trim().ifEmpty { name }
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
