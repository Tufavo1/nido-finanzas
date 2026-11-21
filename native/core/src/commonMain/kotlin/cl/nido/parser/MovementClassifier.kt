// Copyright (c) 2026 Dinovance
package cl.nido.parser

internal data class Movement(val type: Kind, val isWithdrawal: Boolean, val isTransfer: Boolean)

/** Decide si el aviso es plata que entra, un retiro o un gasto, por palabras clave sin tildes. */
internal object MovementClassifier {
    private val INCOME_WORDS = listOf(
        "recibiste", "abono", "deposit", "te han transferido", "te transfirieron", "transferencia recibida",
        "devolucion", "devolvimos", "reverso", "reembolso",
    )
    private val INCOME = Regex(INCOME_WORDS.joinToString("|", prefix = "\\b(?:", postfix = ")"))
    private val WITHDRAWAL = Regex("\\bretiro\\b")
    private val TRANSFER = Regex("\\btransfer")

    fun classify(rawText: String): Movement {
        val t = TextNormalizer.forKeywords(rawText)
        return Movement(
            type = if (INCOME.containsMatchIn(t)) Kind.INCOME else Kind.EXPENSE,
            isWithdrawal = WITHDRAWAL.containsMatchIn(t),
            isTransfer = TRANSFER.containsMatchIn(t),
        )
    }
}
