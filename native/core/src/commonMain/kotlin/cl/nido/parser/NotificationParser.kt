// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * Parser de avisos. Solo procesa paquetes de [allowedPackages] (lista blanca, RF-01); la lista inicial
 * esta vacia y la persona agrega las apps de su banco. Devuelve null si no es un movimiento.
 * Es puro (sin Android) y nunca lanza por un texto raro: lo no reconocido es null.
 */
class NotificationParser(private val allowedPackages: Set<String>) {
    fun parse(packageName: String, title: String?, text: String?, postedAtMillis: Long): ParsedCandidate? {
        if (packageName !in allowedPackages) return null
        val body = text?.trim().orEmpty()
        if (body.isEmpty() || DiscardRules.shouldDiscard(body, title)) return null
        return extract(packageName, body, postedAtMillis)
    }

    private fun extract(packageName: String, body: String, postedAtMillis: Long): ParsedCandidate? {
        val tokens = MoneyExtractor.findAll(body)
        val first = tokens.firstOrNull() ?: return null
        val installmentInfo = InstallmentExtractor.find(body)
        val charged = installmentInfo?.let { info -> tokens.firstOrNull { it.start >= info.markerEnd } } ?: first
        val kind = MovementClassifier.classify(body)
        val merchant = if (kind.type == Kind.INCOME || kind.isWithdrawal) null else
            MerchantExtractor.find(body.substring(0, first.start), body.substring(first.end), kind.isTransfer)
        return ParsedCandidate(
            amountClp = charged.amountClp,
            merchant = merchant,
            kind = kind.type,
            confidence = confidenceOf(kind, merchant),
            installment = installmentInfo?.installment.takeIf { kind.type == Kind.EXPENSE },
            fingerprint = Fingerprint.of(packageName, body, charged.amountClp, postedAtMillis),
        )
    }

    private fun confidenceOf(kind: Movement, merchant: String?): Confidence = when {
        kind.type == Kind.INCOME -> Confidence.HIGH
        kind.isWithdrawal -> Confidence.LOW
        merchant == null -> Confidence.MEDIUM
        else -> Confidence.HIGH
    }
}
