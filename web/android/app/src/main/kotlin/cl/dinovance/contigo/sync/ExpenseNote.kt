// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import cl.nido.parser.ClpAmount
import cl.nido.parser.InstallmentRole
import cl.nido.parser.ParsedCandidate

/**
 * Nota del gasto que arma el telefono al enviarlo solo (debe coincidir con noteOf de web/src/lib/candidates.ts):
 * - monto = una cuota: «Comercio (cuota 1/3)» (como siempre);
 * - compra en cuotas por el TOTAL: «Comercio (3 cuotas de $10.000)» o «Comercio (3 cuotas)» si el aviso no dijo el valor.
 * Sin comercio queda solo lo de las cuotas. Sin cuotas, el comercio.
 */
object ExpenseNote {
    fun of(c: ParsedCandidate): String {
        val merchant = c.merchant?.trim().orEmpty()
        val plan = c.installmentPlan
        val inst = c.installment
        val detail = when {
            inst != null -> "cuota ${inst.n}/${inst.total}"
            plan != null && plan.role == InstallmentRole.PURCHASE -> "${plan.count} cuotas" + (plan.valueClp?.let { " de ${ClpAmount.format(it)}" } ?: "")
            else -> return merchant
        }
        return if (merchant.isEmpty()) detail else "$merchant ($detail)"
    }
}
