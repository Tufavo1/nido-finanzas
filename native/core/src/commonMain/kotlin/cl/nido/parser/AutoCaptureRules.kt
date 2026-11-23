// Copyright (c) 2026 Dinovance
package cl.nido.parser

enum class CaptureMode { CONFIRM, AUTO }

data class CaptureSettings(val mode: CaptureMode = CaptureMode.CONFIRM, val maxClp: Long = DEFAULT_MAX_CLP) {
    companion object {
        /** Decision 3: modo automatico apagado y tope de 50.000 CLP. */
        const val DEFAULT_MAX_CLP = 50_000L
    }
}

enum class CaptureDecision { AUTO_SAVE, ASK }

/** Reglas puras del modo automatico (RF-09); la categoria aprendida la resuelve quien tiene el historial. */
object AutoCaptureRules {
    /**
     * Guardar solo es posible en modo AUTO, con confianza alta y dentro del tope (inclusivo):
     * - un GASTO ademas necesita comercio y una categoria ([hasLearnedCategory]: aprendida o la general por defecto del perfil);
     * - un INGRESO («Recibiste») se guarda como ingreso extra, sin comercio ni categoria;
     * - un pago de deuda o una transferencia que sale jamas: la persona decide a que corresponde.
     */
    fun decide(candidate: ParsedCandidate, settings: CaptureSettings, hasLearnedCategory: Boolean): CaptureDecision {
        if (settings.mode != CaptureMode.AUTO || candidate.confidence != Confidence.HIGH) return CaptureDecision.ASK
        if (candidate.amountClp <= 0 || candidate.amountClp > settings.maxClp) return CaptureDecision.ASK
        return when (candidate.kind) {
            Kind.INCOME -> CaptureDecision.AUTO_SAVE
            Kind.EXPENSE -> if (candidate.merchant.isNullOrBlank() || !hasLearnedCategory) CaptureDecision.ASK else CaptureDecision.AUTO_SAVE
            Kind.DEBT_PAYMENT, Kind.TRANSFER_OUT -> CaptureDecision.ASK
        }
    }
}
