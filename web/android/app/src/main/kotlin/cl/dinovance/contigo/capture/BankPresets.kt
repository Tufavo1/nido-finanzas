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

    fun byId(id: String): BankPreset? = ALL.firstOrNull { it.id == id }
}
