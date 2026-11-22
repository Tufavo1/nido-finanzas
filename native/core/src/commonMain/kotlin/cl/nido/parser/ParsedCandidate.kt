// Copyright (c) 2026 Dinovance
package cl.nido.parser

/** DEBT_PAYMENT: «Pagaste $X a tu tarjeta»: es plata que se mueve a una deuda, no un gasto nuevo. */
enum class Kind { EXPENSE, INCOME, DEBT_PAYMENT }

enum class Confidence { HIGH, MEDIUM, LOW }

data class Installment(val n: Int, val total: Int)

/**
 * Movimiento extraido de un aviso. Por privacidad (NFR-01) NO guarda el texto bruto ni el titulo:
 * solo los campos del contrato y una huella irreversible para deduplicar.
 */
data class ParsedCandidate(
    val amountClp: Long,
    val merchant: String?,
    val kind: Kind,
    val confidence: Confidence,
    val installment: Installment?,
    val fingerprint: String,
    /** Medio de pago o cuenta que nombra el aviso («Débito Banco Falabella», «CMR Mastercard Premium ·5766»). Solo los ultimos 4 digitos. */
    val account: String? = null,
)
