// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

/**
 * Bancos con registro automatico opcional. [candidatePackages] va VACIO a proposito: no se inventan nombres de paquete.
 * La persona asocia cada banco con el paquete real de su app con el «modo aprender» (getRecentNotifyingApps: la app que
 * acaba de avisar) y la asociacion queda guardada en el telefono. Los parsers son SINTETICOS: no verificados con avisos reales.
 */
data class BankPreset(val id: String, val displayName: String, val candidatePackages: List<String> = emptyList())

object BankPresets {
    val ALL = listOf(
        BankPreset("santander", "Santander"),
        BankPreset("banco-estado", "Banco Estado"),
        BankPreset("banco-falabella", "Banco Falabella"),
        BankPreset("banco-chile", "Banco de Chile"),
    )

    fun byId(id: String): BankPreset? = ALL.firstOrNull { it.id == id }
}
