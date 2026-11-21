// Copyright (c) 2026 Dinovance
package cl.nido.parser

enum class Kind { EXPENSE, INCOME }

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
)
