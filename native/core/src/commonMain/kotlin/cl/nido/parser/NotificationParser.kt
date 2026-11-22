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
    fun parseDetailed(packageName: String, title: String?, text: String?, postedAtMillis: Long): ParseResult {
        if (packageName !in allowedPackages) return ParseResult(null, ParseRejection.NOT_ALLOWED)
        val body = text?.trim().orEmpty()
        if (body.isEmpty()) return ParseResult(null, ParseRejection.NO_TEXT)
        if (DiscardRules.shouldDiscard(body, title)) return ParseResult(null, ParseRejection.DISCARDED)
        val tokens = MoneyExtractor.findAll(body)
        if (tokens.isEmpty()) return ParseResult(null, ParseRejection.NO_AMOUNT)
        val candidate = extract(packageName, body, postedAtMillis, tokens)
        val ambiguous = tokens.map { it.amountClp }.distinct().size > 1 && InstallmentExtractor.find(body) == null
        return ParseResult(candidate, if (candidate == null) ParseRejection.NO_AMOUNT else null, ambiguous)
    }

    private fun extract(packageName: String, body: String, postedAtMillis: Long, tokens: List<MoneyToken>): ParsedCandidate? {
        val first = tokens.firstOrNull() ?: return null
        val installmentInfo = InstallmentExtractor.find(body)
        val charged = installmentInfo?.let { info -> tokens.firstOrNull { it.start >= info.markerEnd } } ?: first
        val kind = MovementClassifier.classify(body)
        val merchant = if (kind.type != Kind.EXPENSE || kind.isWithdrawal) null else
            MerchantExtractor.find(body.substring(0, first.start), body.substring(first.end), kind.isTransfer)
        return ParsedCandidate(
            amountClp = charged.amountClp,
            merchant = merchant,
            kind = kind.type,
            confidence = confidenceOf(kind, merchant),
            installment = installmentInfo?.installment.takeIf { kind.type == Kind.EXPENSE },
            fingerprint = Fingerprint.of(packageName, body, charged.amountClp, postedAtMillis),
            account = AccountExtractor.find(body),
        )
    }

    private fun confidenceOf(kind: Movement, merchant: String?): Confidence = when {
        kind.type != Kind.EXPENSE -> Confidence.HIGH
        kind.isWithdrawal -> Confidence.LOW
        merchant == null -> Confidence.MEDIUM
        else -> Confidence.HIGH
    }
}

enum class ParseRejection { NOT_ALLOWED, NO_TEXT, DISCARDED, NO_AMOUNT }

/** [ambiguousAmount]: el aviso trae varios montos distintos y sin cuotas; se toma el primero y conviene confirmar. */
data class ParseResult(val candidate: ParsedCandidate?, val rejection: ParseRejection?, val ambiguousAmount: Boolean = false)
