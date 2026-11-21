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
     * Guardar solo es posible en modo AUTO, para un gasto de confianza alta, dentro del tope (inclusivo), con comercio
     * y una categoria que la persona ya uso. Abonos, retiros y dudas piden confirmacion.
     */
    fun decide(candidate: ParsedCandidate, settings: CaptureSettings, hasLearnedCategory: Boolean): CaptureDecision {
        if (settings.mode != CaptureMode.AUTO || candidate.kind != Kind.EXPENSE || candidate.confidence != Confidence.HIGH) return CaptureDecision.ASK
        if (candidate.amountClp <= 0 || candidate.amountClp > settings.maxClp) return CaptureDecision.ASK
        if (candidate.merchant.isNullOrBlank() || !hasLearnedCategory) return CaptureDecision.ASK
        return CaptureDecision.AUTO_SAVE
    }
}
