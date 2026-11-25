// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * De donde sale la plata de un movimiento. DEBIT: cuenta o tarjeta de debito (baja el saldo de la cuenta).
 * CREDIT: tarjeta de credito (CMR): no baja la cuenta, sube lo usado de la tarjeta. UNKNOWN: el aviso no lo dice
 * («Giraste $15.000 con cargo a tu tarjeta»); se trata como debito, que es la cuenta de todos los dias.
 * El nombre del valor es el `medium` del JSON de borradores que lee el front: no se renombra.
 */
enum class PaymentMedium { DEBIT, CREDIT, UNKNOWN }

object PaymentMediumClassifier {
    // Solo lo explicito: «credito» o la CMR. Visa, Mastercard o Amex a secas tambien existen en debito: no dicen el medio (M2).
    private val CREDIT = Regex("\\bcmr\\b|\\bcredito\\b")
    // Redcompra es la red de debito chilena; «CuentaRUT» (BancoEstado) puede venir pegada.
    private val DEBIT = Regex("\\bdebito\\b|\\bcuenta\\b|\\bcta\\b|\\bvista\\b|\\brut\\b|\\bcuentarut\\b|\\bcorriente\\b|\\bredcompra\\b")

    /** [account] es el medio que nombra el aviso («CMR Mastercard Premium ·5766», «Débito Banco Falabella»). */
    fun of(account: String?): PaymentMedium {
        if (account.isNullOrBlank()) return PaymentMedium.UNKNOWN
        val folded = TextNormalizer.fold(account)
        // «Debito Mastercard» es debito aunque nombre la marca: el debito manda sobre la marca
        if (DEBIT.containsMatchIn(folded)) return PaymentMedium.DEBIT
        if (CREDIT.containsMatchIn(folded)) return PaymentMedium.CREDIT
        return PaymentMedium.UNKNOWN
    }
}
