// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

/**
 * Cuando reintentar el envio en segundo plano (pura, probada en JVM). El retroceso propio de WorkManager crece hasta 5 h: un gasto
 * trabado por un corte de red podia esperar horas con la red ya de vuelta. Aqui la espera se duplica desde 30 s y no pasa de 15 min,
 * con un tope de intentos para no insistir para siempre (sin sesion, servidor caido); un aviso nuevo, abrir la app o «Enviar ahora»
 * vuelven a empezar. Lo que no es pasajero (rechazo, nada que enviar, falta la persona) no reintenta.
 */
object SyncRetryPolicy {
    const val FIRST_DELAY_MILLIS = 30_000L
    const val MAX_DELAY_MILLIS = 15L * 60 * 1000
    /** Unas 11 h de reintentos con red (ya en el tope de 15 min desde el sexto). */
    const val MAX_ATTEMPTS = 48

    /** Espera antes del reintento numero [attempt] (1 = el primero): 30 s, 1, 2, 4, 8 min y luego siempre 15 min. */
    fun delayMillis(attempt: Int): Long {
        val doublings = (attempt - 1).coerceIn(0, MAX_DOUBLINGS)
        return (FIRST_DELAY_MILLIS shl doublings).coerceAtMost(MAX_DELAY_MILLIS)
    }

    /**
     * Espera hasta el siguiente intento, o null si no hay que reintentar. [result] null = la pasada lanzo (no se sabe que salio: es
     * pasajero). [attemptsSoFar] = reintentos ya agendados en esta cadena (0 en el primer intento).
     */
    fun nextDelayMillis(result: SyncResult?, attemptsSoFar: Int): Long? {
        if (result != null && !result.retriesInBackground) return null
        val next = attemptsSoFar + 1
        return if (next > MAX_ATTEMPTS) null else delayMillis(next)
    }

    /** 30 s * 2^5 = 16 min ya supera el tope: mas duplicaciones no cambian nada (y evita desbordar el desplazamiento). */
    private const val MAX_DOUBLINGS = 5
}
