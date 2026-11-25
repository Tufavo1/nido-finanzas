// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * Parser de avisos. Solo procesa paquetes de [allowedPackages] (lista blanca, RF-01); la lista inicial
 * esta vacia y la persona agrega las apps de su banco. Devuelve null si no es un movimiento.
 * Es puro (sin Android) y nunca lanza por un texto raro: lo no reconocido es null.
 */
class NotificationParser(private val allowedPackages: Set<String>) {
    fun parse(packageName: String, title: String?, text: String?, postedAtMillis: Long): ParsedCandidate? =
        parseDetailed(packageName, title, text, postedAtMillis).candidate

    /** Igual que [parse] pero dice POR QUE no hubo candidato (para el diagnostico local; nunca incluye el texto). */
    /**
     * [style]: [NoticeStyle.WALLET] para avisos de Billetera Google (lo decide la app segun la fuente). [utcOffsetMillis]: zona de la
     * persona en postTime (America/Santiago), solo para notar un aviso viejo por la fecha del texto ([ParseResult.staleDate]).
     */
    fun parseDetailed(
        packageName: String, title: String?, text: String?, postedAtMillis: Long,
        style: NoticeStyle = NoticeStyle.BANK, utcOffsetMillis: Long = DEFAULT_UTC_OFFSET_MILLIS,
    ): ParseResult {
        if (packageName !in allowedPackages) return ParseResult(null, ParseRejection.NOT_ALLOWED)
        if (style == NoticeStyle.WALLET) return WalletNotice.parse(packageName, title, text, postedAtMillis, utcOffsetMillis)
        val body = readableBody(title, text)
        if (body.isEmpty()) return ParseResult(null, ParseRejection.NO_TEXT)
        if (DiscardRules.shouldDiscard(body, title)) return ParseResult(null, ParseRejection.DISCARDED)
        if (DiscardRules.isForeignCurrency(listOfNotNull(title, body).joinToString(" "))) return ParseResult(null, ParseRejection.FOREIGN_CURRENCY)
        val tokens = MoneyExtractor.findAll(body)
        if (tokens.isEmpty()) return ParseResult(null, ParseRejection.NO_AMOUNT)
        val kind = MovementClassifier.classify(body)
        // Solo una COMPRA puede ser en cuotas; un abono o una transferencia con «cuotas» en el texto se lee como siempre.
        val installments = if (kind.type == Kind.EXPENSE) InstallmentExtractor.read(body, tokens) else null
        val candidate = extract(packageName, body, postedAtMillis, tokens, kind, installments)
        // Dos montos distintos (compra y comision) sin cuotas, o una compra en cuotas sin total claro: se pudo tomar el equivocado.
        val ambiguous = installments?.ambiguous ?: (tokens.map { it.amountClp }.distinct().size > 1)
        val extraIncome = candidate?.kind == Kind.INCOME && kind.extraIncome
        // Aviso viejo reentregado: la fecha de su texto («el 10/11/2026», «10 nov») es de otro dia que postTime.
        val stale = ShortDate.isStale(TextNormalizer.fold(body), postedAtMillis, utcOffsetMillis)
        return ParseResult(candidate, if (candidate == null) ParseRejection.NO_AMOUNT else null, ambiguous, extraIncome, stale)
    }

    /**
     * Algunas apps (Banco Falabella) ponen el monto en el TÍTULO y el detalle en el cuerpo («Pagaste $300» + «a tu CMR…»).
     * Se junta el título con el cuerpo solo si el título trae monto y el cuerpo no trae ninguno distinto: un título de
     * promoción con otro monto no pisa el del cuerpo.
     */
    private fun readableBody(title: String?, text: String?): String {
        val body = text?.trim().orEmpty()
        val head = title?.trim().orEmpty()
        if (head.isEmpty()) return body
        val headAmounts = MoneyExtractor.findAll(head).map { it.amountClp }.toSet()
        if (headAmounts.isEmpty()) return body
        val bodyAmounts = MoneyExtractor.findAll(body).map { it.amountClp }.toSet()
        return if (headAmounts.containsAll(bodyAmounts)) "$head $body".trim() else body
    }

    private fun extract(
        packageName: String, body: String, postedAtMillis: Long, tokens: List<MoneyToken>, kind: Movement, installments: InstallmentReading?,
    ): ParsedCandidate? {
        val first = tokens.firstOrNull() ?: return null
        // Compra en cuotas: el TOTAL (o, sin total informado, la cuota); si no, el primer monto
        val charged = installments?.amount ?: first
        // En una transferencia que sale, el «comercio» es el destinatario.
        val named = kind.type == Kind.EXPENSE || kind.type == Kind.TRANSFER_OUT
        val merchant = if (!named || kind.isWithdrawal) null else
            MerchantExtractor.find(body.substring(0, first.start), body.substring(first.end), kind.isTransfer)
        return ParsedCandidate(
            amountClp = charged.amountClp,
            merchant = merchant,
            kind = kind.type,
            confidence = confidenceOf(kind, merchant),
            installment = installments?.installment,
            fingerprint = Fingerprint.of(packageName, body, charged.amountClp, postedAtMillis),
            account = AccountExtractor.find(body),
            installmentPlan = installments?.plan,
        )
    }

    companion object {
        /** Chile continental en horario de verano (UTC-3); la app pasa el de America/Santiago en postTime. */
        const val DEFAULT_UTC_OFFSET_MILLIS = -3L * 60 * 60 * 1000
    }

    private fun confidenceOf(kind: Movement, merchant: String?): Confidence = when {
        kind.type == Kind.TRANSFER_OUT -> if (merchant == null) Confidence.MEDIUM else Confidence.HIGH
        kind.type != Kind.EXPENSE -> Confidence.HIGH
        kind.isWithdrawal -> Confidence.LOW
        merchant == null -> Confidence.MEDIUM
        else -> Confidence.HIGH
    }
}

/** [FOREIGN_CURRENCY]: compra en otra moneda (USD, EUR, UF...): nunca se guarda como pesos; el diagnostico lo dice para anotarla a mano. */
enum class ParseRejection { NOT_ALLOWED, NO_TEXT, DISCARDED, NO_AMOUNT, FOREIGN_CURRENCY }

/**
 * [ambiguousAmount]: el aviso trae varios montos distintos y se toma uno, o es una compra en cuotas sin total informado (el monto es
 * UNA cuota, ver [ParsedCandidate.installmentTotalUnknown]): conviene confirmar.
 * [extraIncome]: INCOME que es plata que te mandan («Recibiste», «Te transfirieron»): el unico ingreso que puede guardarse solo
 * como «Ingreso extra». Un abono, devolucion o reversa es INCOME pero false. No se guarda en el borrador (no es parte del JSON).
 * [staleDate]: el texto trae una fecha («20 nov») a mas de 36 h del dia de postTime: aviso viejo reentregado; no se guarda solo.
 */
data class ParseResult(
    val candidate: ParsedCandidate?,
    val rejection: ParseRejection?,
    val ambiguousAmount: Boolean = false,
    val extraIncome: Boolean = false,
    val staleDate: Boolean = false,
)
