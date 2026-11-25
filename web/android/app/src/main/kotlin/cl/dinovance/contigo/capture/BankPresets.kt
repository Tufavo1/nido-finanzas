// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

/**
 * Bancos con registro automatico opcional. [candidatePackages] va VACIO a proposito: no se inventan nombres de paquete.
 * La persona asocia cada banco con el paquete real de su app con el «modo aprender» (getRecentNotifyingApps: la app que
 * acaba de avisar) y la asociacion queda guardada en el telefono. Los parsers son SINTETICOS: no verificados con avisos reales.
 */
data class BankPreset(val id: String, val displayName: String, val candidatePackages: List<String> = emptyList())

object BankPresets {
    /** Id estable de Billetera Google (Google Wallet). El paquete NO se fija aqui: se detecta por nombre visible o se aprende. */
    const val WALLET_ID = "billetera-google"

    val ALL = listOf(
        BankPreset("santander", "Santander"),
        BankPreset("banco-estado", "Banco Estado"),
        BankPreset("banco-falabella", "Banco Falabella"),
        BankPreset("banco-chile", "Banco de Chile"),
        // No es un banco: es la billetera del telefono (pagos sin contacto con la tarjeta). Mismo trato que un banco: deteccion por nombre
        // visible, guardado automatico opcional y avisos SINTETICOS (no verificados con avisos reales). Sus avisos se leen con
        // NoticeStyle.WALLET y la misma compra avisada tambien por el banco se deduplica entre fuentes (CaptureProcessor).
        BankPreset(WALLET_ID, "Billetera Google"),
    )

    /**
     * UNICA lista nativa de fuentes con captura de avisos VERIFICADA (decision del dueno, 2026-11-24). Espejo de `CAPTURE_AVAILABLE` en
     * web/src/lib/bankAuto.ts. Santander, Banco Estado y Banco de Chile siguen en [ALL] y conservan sus reglas de deteccion
     * (BankMatcher), pero no se ofrecen, no se encienden y sus avisos no se leen ([CaptureSources]). Para reactivar uno basta agregar
     * su id aqui (y `available: true` en el front).
     */
    val VERIFIED: Set<String> = setOf("banco-falabella", WALLET_ID)

    fun byId(id: String): BankPreset? = ALL.firstOrNull { it.id == id }
}

/**
 * Reglas puras de que fuentes se ofrecen y se encienden. Una fuente NO verificada nunca se enciende ni se lee; si la persona la tenia
 * encendida de antes, se sigue mostrando (solo para apagarla) y su preferencia guardada NO se borra: al reactivarla el dueno, vuelve
 * tal como estaba. [verified] se inyecta solo en pruebas.
 */
object CaptureSources {
    fun isVerified(bankId: String, verified: Set<String> = BankPresets.VERIFIED): Boolean = bankId in verified

    /** getDetectedBanks: las verificadas (con not_found) y, de las ocultas, solo las ya encendidas con su app. */
    fun visibleDetected(detected: List<DetectedBank>, autoOn: (String) -> Boolean, verified: Set<String> = BankPresets.VERIFIED): List<DetectedBank> =
        detected.filter { isVerified(it.bankId, verified) || (it.status != DetectStatus.not_found && autoOn(it.bankId)) }

    /** setBankAutoSave: apagar siempre se puede; encender, solo una fuente verificada. */
    fun canSetAutoSave(bankId: String, enabled: Boolean, verified: Set<String> = BankPresets.VERIFIED): Boolean = !enabled || isVerified(bankId, verified)
}
