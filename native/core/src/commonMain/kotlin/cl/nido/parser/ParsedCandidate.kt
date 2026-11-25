// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * DEBT_PAYMENT: «Pagaste $X a tu tarjeta»: es plata que se mueve a una deuda, no un gasto nuevo.
 * TRANSFER_OUT: «Transferiste $X a NOMBRE»: puede ser un gasto o un pago de deuda; lo decide la persona, nunca se guarda solo.
 * El nombre del valor ([name]) es el `kind` del JSON de borradores que lee el front: no se renombra.
 */
enum class Kind { EXPENSE, INCOME, DEBT_PAYMENT, TRANSFER_OUT }

enum class Confidence { HIGH, MEDIUM, LOW }

/** El monto del candidato es la cuota [n] de [total] (solo cuando [ParsedCandidate.amountClp] es el valor de UNA cuota). */
data class Installment(val n: Int, val total: Int)

/**
 * [PURCHASE]: compra nueva en cuotas («Compraste $30.000 en 3 cuotas de $10.000»): el monto es el TOTAL (lo que se debe y usa del cupo).
 * [PRIOR_CHARGE]: cobro de una cuota de una compra anterior («Cuota 2 de 6 por $15.000»): no es un gasto nuevo, la compra ya se anoto.
 * El nombre del valor es el `installmentRole` del JSON de borradores que lee el front: no se renombra.
 */
enum class InstallmentRole { PURCHASE, PRIOR_CHARGE }

/**
 * Compra o cobro en cuotas (decision del dueno 2026-11-24: nunca se guarda solo). [count]: numero de cuotas (2 o mas); [valueClp]:
 * valor de cada cuota si el aviso lo dice (null = no lo dice; no se calcula: puede haber intereses).
 */
data class InstallmentPlan(val role: InstallmentRole, val count: Int, val valueClp: Long?)

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
    /** Compra en cuotas o cobro de una cuota; null = pago normal. Aditivo: los borradores anteriores no lo traen. */
    val installmentPlan: InstallmentPlan? = null,
) {
    /** Compra en cuotas cuyo aviso no dijo el total: [amountClp] es UNA cuota ([installment] 1/N), no lo que se debe. */
    val installmentTotalUnknown: Boolean get() = installmentPlan?.role == InstallmentRole.PURCHASE && installment != null

    /** De donde sale la plata; se deduce de [account], no se guarda aparte. */
    val medium: PaymentMedium get() = PaymentMediumClassifier.of(account)
}
