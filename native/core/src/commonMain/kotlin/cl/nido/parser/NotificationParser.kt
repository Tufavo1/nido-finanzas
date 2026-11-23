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
        val body = readableBody(title, text)
        if (body.isEmpty()) return ParseResult(null, ParseRejection.NO_TEXT)
        if (DiscardRules.shouldDiscard(body, title)) return ParseResult(null, ParseRejection.DISCARDED)
        val tokens = MoneyExtractor.findAll(body)
        if (tokens.isEmpty()) return ParseResult(null, ParseRejection.NO_AMOUNT)
        val candidate = extract(packageName, body, postedAtMillis, tokens)
        val ambiguous = tokens.map { it.amountClp }.distinct().size > 1 && InstallmentExtractor.find(body) == null
        val extraIncome = candidate?.kind == Kind.INCOME && MovementClassifier.classify(body).extraIncome
        return ParseResult(candidate, if (candidate == null) ParseRejection.NO_AMOUNT else null, ambiguous, extraIncome)
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

    private fun extract(packageName: String, body: String, postedAtMillis: Long, tokens: List<MoneyToken>): ParsedCandidate? {
        val first = tokens.firstOrNull() ?: return null
        val installmentInfo = InstallmentExtractor.find(body)
        val charged = installmentInfo?.let { info -> tokens.firstOrNull { it.start >= info.markerEnd } } ?: first
        val kind = MovementClassifier.classify(body)
        // En una transferencia que sale, el «comercio» es el destinatario.
        val named = kind.type == Kind.EXPENSE || kind.type == Kind.TRANSFER_OUT
        val merchant = if (!named || kind.isWithdrawal) null else
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
        kind.type == Kind.TRANSFER_OUT -> if (merchant == null) Confidence.MEDIUM else Confidence.HIGH
        kind.type != Kind.EXPENSE -> Confidence.HIGH
        kind.isWithdrawal -> Confidence.LOW
        merchant == null -> Confidence.MEDIUM
        else -> Confidence.HIGH
    }
}

enum class ParseRejection { NOT_ALLOWED, NO_TEXT, DISCARDED, NO_AMOUNT }

/**
 * [ambiguousAmount]: el aviso trae varios montos distintos y sin cuotas; se toma el primero y conviene confirmar.
 * [extraIncome]: INCOME que es plata que te mandan («Recibiste», «Te transfirieron»): el unico ingreso que puede guardarse solo
 * como «Ingreso extra». Un abono, devolucion o reversa es INCOME pero false. No se guarda en el borrador (no es parte del JSON).
 */
data class ParseResult(val candidate: ParsedCandidate?, val rejection: ParseRejection?, val ambiguousAmount: Boolean = false, val extraIncome: Boolean = false)
