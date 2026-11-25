// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import cl.nido.parser.Confidence
import cl.nido.parser.Installment
import cl.nido.parser.InstallmentPlan
import cl.nido.parser.InstallmentRole
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.json.JSONObject

enum class DraftStatus { PENDING, CONFIRMED }

/** Borrador de gasto capturado. Guarda solo lo extraído: jamás el texto ni el título del aviso (NFR-01). */
data class Draft(
    val id: String,
    val candidate: ParsedCandidate,
    val postedAtMillis: Long,
    val createdAtMillis: Long,
    val status: DraftStatus,
    /** Paquete de la app que avisó (trazabilidad; no es dato personal). */
    val sourcePackage: String = "",
    /** Usuario/hogar activo al capturar. El borrador solo se muestra y se envía a ese dueño (H-06). */
    val ownerKey: String? = null,
    /** Hay otro borrador igual (monto y comercio) de menos de 2 minutos: se conserva y se marca, la persona decide (H-04). */
    val possibleDuplicate: Boolean = false,
    /** Categoria con que se guardo solo (registro automatico); null = la elegira la persona. */
    val categoryId: String? = null,
    /** Guardado automaticamente por el telefono, sin pulsar «Guardar». */
    val autoSaved: Boolean = false,
    /** La base rechazo este gasto (4xx): no se reenvia solo; queda visible como «rechazado» (R3-09). */
    val syncRejected: Boolean = false,
    /** El aviso traia varios montos distintos (compra y comision): se tomo uno y la persona debe confirmarlo; nunca se guarda solo (M1). */
    val ambiguousAmount: Boolean = false,
    /** Aviso viejo reentregado (la fecha de su texto es de otro dia): la persona decide; nunca se guarda solo. */
    val staleDate: Boolean = false,
) {
    /**
     * «Guardar» desde la notificacion (sin abrir la app) envia el gasto tal cual. Solo un GASTO (ingresos, pagos de deuda y
     * transferencias se deciden en la app), y nunca el cobro de una cuota de una compra anterior (no es gasto nuevo) ni una compra en
     * cuotas sin total (el monto es UNA cuota) o con monto dudoso. El envio en segundo plano usa la misma regla como barrera.
     */
    val savableFromNotification: Boolean
        get() = candidate.kind == Kind.EXPENSE && candidate.installmentPlan?.role != InstallmentRole.PRIOR_CHARGE && !candidate.installmentTotalUnknown &&
            // Compra en cuotas con varios montos en el aviso: no se sabe si el monto es el total (contrato del front: NO_TOTAL)
            !(candidate.installmentPlan?.role == InstallmentRole.PURCHASE && ambiguousAmount)


    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("amountClp", candidate.amountClp)
        .put("merchant", candidate.merchant ?: JSONObject.NULL)
        .put("kind", candidate.kind.name)
        .put("confidence", candidate.confidence.name)
        .put("installment", candidate.installment?.let { JSONObject().put("n", it.n).put("total", it.total) } ?: JSONObject.NULL)
        .put("fingerprint", candidate.fingerprint)
        .put("account", candidate.account ?: JSONObject.NULL)
        .put("medium", candidate.medium.name)
        .put("postedAtMillis", postedAtMillis)
        .put("createdAtMillis", createdAtMillis)
        .put("status", status.name)
        .put("sourcePackage", sourcePackage)
        .put("ownerKey", ownerKey ?: JSONObject.NULL)
        .put("possibleDuplicate", possibleDuplicate)
        .put("categoryId", categoryId ?: JSONObject.NULL)
        .put("autoSaved", autoSaved)
        .put("syncRejected", syncRejected)
        .put("ambiguousAmount", ambiguousAmount)
        .put("staleDate", staleDate)
        // Compra en cuotas (aditivo, decision del dueno 2026-11-24). PURCHASE: amountClp es el TOTAL; PRIOR_CHARGE: cobro de una cuota
        // de una compra anterior. installmentValueClp null = el aviso no dijo el valor de la cuota. Contrato en docs/mobile/backend-android.md.
        .put("installmentRole", candidate.installmentPlan?.role?.name ?: JSONObject.NULL)
        .put("installmentCount", candidate.installmentPlan?.count ?: JSONObject.NULL)
        .put("installmentValueClp", candidate.installmentPlan?.valueClp ?: JSONObject.NULL)

    companion object {
        /** Opcional: un borrador guardado antes no lo trae; un rol desconocido o un numero de cuotas invalido se lee como sin plan. */
        private fun planOf(o: JSONObject): InstallmentPlan? {
            if (o.isNull("installmentRole")) return null
            val role = InstallmentRole.entries.firstOrNull { it.name == o.optString("installmentRole") } ?: return null
            val count = o.optInt("installmentCount", 0).takeIf { it >= 2 } ?: return null
            val value = if (o.isNull("installmentValueClp")) null else o.optLong("installmentValueClp", 0L).takeIf { it > 0 }
            return InstallmentPlan(role, count, value)
        }

        fun fromJson(o: JSONObject): Draft {
            val installment = o.optJSONObject("installment")?.let { Installment(it.getInt("n"), it.getInt("total")) }
            val candidate = ParsedCandidate(
                amountClp = o.getLong("amountClp"),
                merchant = if (o.isNull("merchant")) null else o.getString("merchant"),
                kind = Kind.valueOf(o.getString("kind")),
                confidence = Confidence.valueOf(o.getString("confidence")),
                installment = installment,
                fingerprint = o.getString("fingerprint"),
                account = if (o.isNull("account")) null else o.optString("account").ifBlank { null },
                installmentPlan = planOf(o),
            )
            return Draft(
                id = o.getString("id"),
                candidate = candidate,
                postedAtMillis = o.getLong("postedAtMillis"),
                createdAtMillis = o.getLong("createdAtMillis"),
                status = DraftStatus.valueOf(o.getString("status")),
                sourcePackage = o.optString("sourcePackage", ""),
                ownerKey = if (o.isNull("ownerKey")) null else o.optString("ownerKey"),
                possibleDuplicate = o.optBoolean("possibleDuplicate", false),
                categoryId = if (o.isNull("categoryId")) null else o.optString("categoryId"),
                autoSaved = o.optBoolean("autoSaved", false),
                syncRejected = o.optBoolean("syncRejected", false),
                // Opcional: un borrador guardado antes no lo trae y se comporta como siempre
                ambiguousAmount = o.optBoolean("ambiguousAmount", false),
                staleDate = o.optBoolean("staleDate", false),
            )
        }
    }
}
