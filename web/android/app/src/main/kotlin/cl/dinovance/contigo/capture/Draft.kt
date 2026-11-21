// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import cl.nido.parser.Confidence
import cl.nido.parser.Installment
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
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("amountClp", candidate.amountClp)
        .put("merchant", candidate.merchant ?: JSONObject.NULL)
        .put("kind", candidate.kind.name)
        .put("confidence", candidate.confidence.name)
        .put("installment", candidate.installment?.let { JSONObject().put("n", it.n).put("total", it.total) } ?: JSONObject.NULL)
        .put("fingerprint", candidate.fingerprint)
        .put("postedAtMillis", postedAtMillis)
        .put("createdAtMillis", createdAtMillis)
        .put("status", status.name)
        .put("sourcePackage", sourcePackage)
        .put("ownerKey", ownerKey ?: JSONObject.NULL)
        .put("possibleDuplicate", possibleDuplicate)

    companion object {
        fun fromJson(o: JSONObject): Draft {
            val installment = o.optJSONObject("installment")?.let { Installment(it.getInt("n"), it.getInt("total")) }
            val candidate = ParsedCandidate(
                amountClp = o.getLong("amountClp"),
                merchant = if (o.isNull("merchant")) null else o.getString("merchant"),
                kind = Kind.valueOf(o.getString("kind")),
                confidence = Confidence.valueOf(o.getString("confidence")),
                installment = installment,
                fingerprint = o.getString("fingerprint"),
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
            )
        }
    }
}
