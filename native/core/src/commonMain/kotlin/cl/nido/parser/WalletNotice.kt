// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * Como se lee el aviso. [BANK]: avisos de banco en frases («Compraste $X en COMERCIO»), como siempre. [WALLET]: Billetera Google
 * (Google Wallet), que muestra piezas sueltas «COMERCIO · 23 nov · CLP 20,000 · Visa ••1234» repartidas entre titulo y texto.
 * El estilo lo decide quien conoce la FUENTE (la app: banco asociado «billetera-google»), nunca el texto.
 */
enum class NoticeStyle { BANK, WALLET }

/**
 * Avisos de Billetera Google. Solo COMPRAS con tarjeta (pago sin contacto de la persona): siempre [Kind.EXPENSE]; nunca pago de deuda,
 * transferencia ni ingreso, salvo un reembolso/devolucion, que es [Kind.INCOME] de confianza BAJA (nunca se guarda solo).
 * Confianza ALTA con comercio y UN monto CLP claro; MEDIA sin comercio o con varios montos.
 * Titulo y texto se juntan SIEMPRE (con salto de linea): no se sabe que parte viene en cada uno. Textos SINTETICOS: no hay avisos
 * reales de Wallet verificados.
 */
internal object WalletNotice {
    // Lo que no es un movimiento de dinero: tarjetas agregadas, listas, por vencer, verificaciones, pendientes, rechazos, promociones y
    // cosas que no son compras con tarjeta (transferencias, plata recibida, retiros). Sobre texto plegado (minusculas, sin tildes).
    private val NOT_A_PURCHASE = Regex(
        "\\b(?:" + listOf(
            "se agrego", "se anadio", "agregaste", "agregada", "agregamos", "anadiste", "anadida", "esta lista", "lista para", "por vencer",
            "vencio", "vencera", "vencida", "expira", "caduca", "verific", "valida tu", "confirma tu", "configura", "actualiza", "pendiente",
            "en proceso", "procesando", "rechazad", "declinad", "fallid", "cancelad", "no se pudo", "no pudimos", "no se complet", "no complet",
            "oferta", "beneficio", "cashback", "recompensa", "invita", "sabias", "consejo", "novedad",
            "added", "expir", "verify", "declined", "failed", "pending", "offer",
            "transferencia", "transferiste", "te transfirieron", "recibiste", "retiraste", "giraste",
        ).joinToString("|") + ")|\\b(?:vence|promo|promos|retiro)\\b",
    )
    // Pases, entradas, boletos y tarjetas de transporte: sin monto no son una compra.
    private val PASS = Regex("\\b(?:pases?|entradas?|boletos?|tickets?|embarque|vuelo|evento|tarjeta de transporte|bip|boarding|pass)\\b")
    private val REFUND = Regex("\\b(?:reembols|devolucion|devoluciones|devolvimos|devuelt|refund|reversa|reverso|reversad|anulad|anulacion)")

    // Tarjeta: marca o tipo, con los ultimos digitos detras de puntos o asteriscos («Visa ••1234», «Mastercard •••• 5678»). Un «·» suelto
    // es separador, no mascara. Solo se conservan los ULTIMOS 4 digitos.
    private const val MASK = "(?:[•·*●∙‧]{2,}|[•*●∙‧…])"
    private const val BRANDS = "visa|master\\s?card|amex|american express|diners(?: club)?|redcompra|maestro|tarjeta|cmr"
    private val CARD = Regex("\\b($BRANDS)\\b(?:\\s+(?:de\\s+)?(debito|credito))?(?:\\s*(?:terminada\\s+en\\s*)?$MASK\\s*(\\d{4,}))?")
    private val CARD_TYPE = Regex("\\b(debito|credito)\\b(?:\\s*$MASK\\s*(\\d{4,}))?")
    private val MASKED_DIGITS = Regex("$MASK\\s*\\d{4,}")
    private val BRAND_NAMES = mapOf(
        "visa" to "Visa", "mastercard" to "Mastercard", "master card" to "Mastercard", "amex" to "Amex", "american express" to "American Express",
        "diners" to "Diners", "diners club" to "Diners Club", "redcompra" to "Redcompra", "maestro" to "Maestro", "tarjeta" to "Tarjeta", "cmr" to "CMR",
    )
    private val TYPE_NAMES = mapOf("debito" to "Débito", "credito" to "Crédito")

    private val SEPARATORS = Regex("[\\n\\r|·•]|\\s[-–—]\\s")
    private const val PUNCT = "(?:\\s|[-–—:,.!])*"
    // Solo verbos y «en»/«con» al inicio: un comercio puede empezar con «El», «La», «A» o «De» («El Mesón», «La Fete»).
    private val LEADING = Regex(
        "^$PUNCT(?:(?:nueva\\s+)?compra(?:\\s+(?:realizada|aprobada|exitosa))?|compraste|pagaste|pagado|pago(?:\\s+(?:realizado|aprobado|exitoso|sin\\s+contacto))?" +
            "|transaccion(?:\\s+(?:aprobada|realizada))?|cargo|en|con)\\b$PUNCT",
    )
    private val TRAILING = Regex("$PUNCT\\b(?:en|a|al|con|de|desde|por|el|la|las|tu|su|y)$PUNCT$")
    private val FILLER = Regex(
        "^(?:google\\s+pay|g\\s?pay|billetera(?:\\s+de)?\\s+google|google\\s+wallet|wallet|billetera|compra|pago|listo|aprobad[oa]|realizad[oa]" +
            "|sin\\s+contacto|tu\\s+compra|notificacion|transaccion|tu|su|con\\s+(?:google\\s+pay|billetera(?:\\s+de)?\\s+google|google\\s+wallet))$",
    )

    fun parse(packageName: String, title: String?, text: String?, postedAtMillis: Long, utcOffsetMillis: Long): ParseResult {
        val body = listOfNotNull(title?.trim()?.takeIf { it.isNotEmpty() }, text?.trim()?.takeIf { it.isNotEmpty() }).joinToString("\n")
        if (body.isEmpty()) return ParseResult(null, ParseRejection.NO_TEXT)
        if (DiscardRules.shouldDiscard(body, null)) return ParseResult(null, ParseRejection.DISCARDED)
        val folded = TextNormalizer.fold(body)
        if (NOT_A_PURCHASE.containsMatchIn(folded)) return ParseResult(null, ParseRejection.DISCARDED)
        val tokens = MoneyExtractor.findAllWallet(body)
        if (tokens.isEmpty()) return ParseResult(null, if (PASS.containsMatchIn(folded)) ParseRejection.DISCARDED else ParseRejection.NO_AMOUNT)
        val amount = tokens.first().amountClp
        val ambiguous = tokens.map { it.amountClp }.distinct().size > 1
        val refund = REFUND.containsMatchIn(folded)
        val removed = ArrayList<IntRange>()
        tokens.forEach { removed.add(it.start until it.end) }
        val account = account(blank(folded, removed), removed)
        removed.addAll(ShortDate.ranges(folded))
        val merchant = if (refund) null else merchant(body, folded, removed)
        val candidate = ParsedCandidate(
            amountClp = amount,
            merchant = merchant,
            kind = if (refund) Kind.INCOME else Kind.EXPENSE,
            confidence = when {
                refund -> Confidence.LOW
                merchant == null || ambiguous -> Confidence.MEDIUM
                else -> Confidence.HIGH
            },
            installment = null,
            fingerprint = Fingerprint.of(packageName, body, amount, postedAtMillis),
            account = account,
        )
        return ParseResult(candidate, null, ambiguous, extraIncome = false, staleDate = ShortDate.isStale(folded, postedAtMillis, utcOffsetMillis))
    }

    /** La tarjeta del aviso (marca/tipo y ultimos 4). Agrega a [removed] todo lo que es tarjeta para que no quede en el comercio. */
    private fun account(folded: String, removed: MutableList<IntRange>): String? {
        var best: String? = null
        for (m in CARD.findAll(folded)) {
            removed.add(m.range)
            val brand = BRAND_NAMES[m.groupValues[1].replace(Regex("\\s+"), " ")] ?: continue
            val type = TYPE_NAMES[m.groupValues[2]]
            val digits = m.groupValues[3].takeIf { it.isNotEmpty() }?.takeLast(4)
            // «tarjeta» a secas («con tu tarjeta») no dice cual: no es cuenta
            if (brand == "Tarjeta" && type == null && digits == null) continue
            if (best == null) best = listOfNotNull(brand, type).joinToString(" ") + (digits?.let { " ·$it" } ?: "")
        }
        for (m in CARD_TYPE.findAll(folded)) {
            if (removed.any { m.range.first in it }) continue
            removed.add(m.range)
            if (best == null) best = TYPE_NAMES[m.groupValues[1]] + (m.groupValues[2].takeIf { it.isNotEmpty() }?.let { " ·" + it.takeLast(4) } ?: "")
        }
        MASKED_DIGITS.findAll(folded).forEach { m -> if (removed.none { m.range.first in it }) removed.add(m.range) }
        return best
    }

    /** El primer trozo (entre separadores) que queda con letras tras quitar monto, fecha, tarjeta y palabras de relleno. */
    private fun merchant(body: String, folded: String, removed: List<IntRange>): String? {
        val cleanText = blank(body, removed)
        val cleanFolded = blank(folded, removed)
        var from = 0
        val pieces = ArrayList<IntRange>()
        SEPARATORS.findAll(cleanFolded).forEach { pieces.add(from until it.range.first); from = it.range.last + 1 }
        pieces.add(from until cleanFolded.length)
        for (r in pieces) {
            if (r.isEmpty()) continue
            var seg = cleanText.substring(r.first, r.last + 1)
            var low = cleanFolded.substring(r.first, r.last + 1)
            while (true) {
                val m = LEADING.find(low) ?: break
                if (m.range.isEmpty()) break
                seg = seg.substring(m.range.last + 1); low = low.substring(m.range.last + 1)
            }
            while (true) {
                val m = TRAILING.find(low) ?: break
                if (m.range.isEmpty()) break
                seg = seg.substring(0, m.range.first); low = low.substring(0, m.range.first)
            }
            if (FILLER.matches(low.trim().replace(Regex("\\s+"), " "))) continue
            if (seg.none { it.isLetter() }) continue
            val name = MerchantExtractor.clean(seg)
            if (name.any { it.isLetter() }) return name
        }
        return null
    }

    /** Copia de [s] con los rangos reemplazados por un salto de linea (separador): misma longitud. */
    private fun blank(s: String, ranges: List<IntRange>): String {
        val out = s.toCharArray()
        ranges.forEach { r -> for (i in r) if (i in out.indices) out[i] = '\n' }
        return out.concatToString()
    }
}
