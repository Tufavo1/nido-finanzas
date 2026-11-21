// Copyright (c) 2026 Dinovance
package cl.nido.parser

/** Huella de deduplicacion (RF-04): paquete + texto normalizado + monto + minuto. No es reversible. */
internal object Fingerprint {
    private const val MILLIS_PER_MINUTE = 60_000L

    fun of(packageName: String, rawText: String, amountClp: Long, postedAtMillis: Long): String {
        val minute = postedAtMillis.floorDiv(MILLIS_PER_MINUTE)
        val material = listOf(packageName, TextNormalizer.forFingerprint(rawText), amountClp, minute).joinToString("\u0000")
        return Sha256.hex(material.encodeToByteArray())
    }
}
