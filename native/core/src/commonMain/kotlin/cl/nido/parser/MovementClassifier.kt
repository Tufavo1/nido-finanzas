// Copyright (c) 2026 Dinovance
package cl.nido.parser

/** [extraIncome]: plata que te mandan («Recibiste», «Te transfirieron»), no un abono, devolucion ni reversa. */
internal data class Movement(val type: Kind, val isWithdrawal: Boolean, val isTransfer: Boolean, val extraIncome: Boolean = false)

/**
 * Decide si el aviso es plata que entra, un pago a tu tarjeta, una transferencia que hiciste, un retiro o un gasto, por palabras
 * clave sin tildes. Una transferencia que sale («Transferiste $X a NOMBRE», «Transferencia realizada a ...») es [Kind.TRANSFER_OUT]:
 * puede ser un gasto o un pago de deuda y lo decide la persona. Un retiro con la palabra «transferencia» sigue como retiro.
 */
internal object MovementClassifier {
    private val INCOME_WORDS = listOf(
        "recibiste", "abono", "deposit", "te han transferido", "te transfirieron", "transferencia recibida",
        "devolucion", "devolvimos", "reverso", "reversa", "reversad", "anulaste", "anulacion", "anulad", "reembolso",
    )
    private val INCOME = Regex(INCOME_WORDS.joinToString("|", prefix = "\\b(?:", postfix = ")"))
    private val RECEIVED = Regex("^recibiste\\b|\\b(?:te han transferido|te transfirieron|transferencia recibida)\\b")
    private val REFUND = Regex("\\b(?:abono|deposit|devolucion|devolvimos|reverso|reversa|reversad|anulaste|anulacion|anulad|reembolso)")
    private val WITHDRAWAL = Regex("\\b(?:retiro|retiraste)\\b")
    private val TRANSFER = Regex("\\btransfer")
    // «Pagaste $34.400 [14:35] a tu CMR Mastercard Premium»: pago a la propia tarjeta o linea. «Pagaste $5.000 en Cafe» sigue siendo gasto.
    private val DEBT_PAYMENT = Regex("\\bpagaste\\b(?:[^a-z]|clp|a las|hrs?|el)*\\ba\\s+(?:tu|su)\\s+(?:cmr|tarjeta|credito|linea)\\b")

    fun classify(rawText: String): Movement {
        val t = TextNormalizer.forKeywords(rawText)
        val type = when {
                // El verbo con que EMPIEZA el aviso manda: «Compraste ... en Abono Metro» es gasto aunque el comercio diga «abono».
                t.startsWith("compraste") -> Kind.EXPENSE
                t.startsWith("recibiste") -> Kind.INCOME
                DEBT_PAYMENT.containsMatchIn(t) -> Kind.DEBT_PAYMENT
                INCOME.containsMatchIn(t) -> Kind.INCOME
                TRANSFER.containsMatchIn(t) && !WITHDRAWAL.containsMatchIn(t) -> Kind.TRANSFER_OUT
                else -> Kind.EXPENSE
            }
        return Movement(
            type = type,
            isWithdrawal = WITHDRAWAL.containsMatchIn(t),
            isTransfer = TRANSFER.containsMatchIn(t),
            extraIncome = type == Kind.INCOME && RECEIVED.containsMatchIn(t) && !REFUND.containsMatchIn(t),
        )
    }
}
