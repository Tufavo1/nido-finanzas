// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

/**
 * Estado del servicio de lectura de avisos para `getCaptureHealth`.
 * OK = leyendo; NO_ACCESS = sin acceso a notificaciones; DISCONNECTED = con acceso pero Android no lo tiene conectado;
 * BATTERY_RESTRICTED = conectado, pero Android restringe la app en segundo plano; CONNECTING = la app recien abrio y el sistema aun
 * no conecta el servicio (margen de [CaptureHealth.GRACE_MILLIS] antes de decir DISCONNECTED).
 */
enum class HealthState { OK, NO_ACCESS, DISCONNECTED, BATTERY_RESTRICTED, CONNECTING }

/**
 * [connectedNow]: el servicio esta conectado AHORA en este proceso (NotificationCaptureService.instance). Es mas fiable que la marca
 * guardada: si el proceso murio (p. ej. al actualizar la app) la marca puede seguir diciendo «conectado».
 * [backgroundRestricted]: el usuario o el sistema restringio la app en segundo plano (ActivityManager.isBackgroundRestricted o el
 * grupo RESTRICTED de espera). [batteryOptimized]: optimizacion de bateria normal (casi todas las apps; solo un aviso).
 */
data class HealthInputs(
    val now: Long,
    val listenerAllowed: Boolean,
    val connectedNow: Boolean,
    val snapshot: HealthSnapshot,
    val versionCode: Long,
    val backgroundRestricted: Boolean,
    val batteryOptimized: Boolean,
    val processAgeMillis: Long,
    val whitelistCount: Int,
)

data class CaptureHealthReport(
    val state: HealthState,
    val disconnectedSinceMillis: Long?,
    val disconnectedHours: Int?,
    /** Desconectado y la ultima conexion fue con otra version de la app (se actualizo y Android no volvio a conectarlo). */
    val sinceUpdate: Boolean,
    val inputs: HealthInputs,
    val rebindRequested: Boolean = false,
) {
    /** Solo numeros, booleanos y un enum: jamas texto de avisos ni nombres de paquete. */
    fun toMap(): Map<String, Any?> = mapOf(
        "state" to state.name,
        "listenerAllowed" to inputs.listenerAllowed,
        "connected" to inputs.connectedNow,
        "disconnectedSinceMillis" to disconnectedSinceMillis,
        "disconnectedHours" to disconnectedHours,
        "sinceUpdate" to sinceUpdate,
        "backgroundRestricted" to inputs.backgroundRestricted,
        "batteryOptimized" to inputs.batteryOptimized,
        "lastEventAt" to inputs.snapshot.lastEventAt,
        "lastConnectedAt" to inputs.snapshot.lastConnectedAt,
        "whitelistCount" to inputs.whitelistCount,
        "rebindRequested" to rebindRequested,
    )
}

object CaptureHealth {
    const val GRACE_MILLIS = 60_000L
    private const val HOUR = 3_600_000L

    fun compute(i: HealthInputs): CaptureHealthReport {
        val s = i.snapshot
        val since = s.lastDisconnectedAt?.takeIf { d -> s.lastConnectedAt == null || d >= s.lastConnectedAt }
        val sinceUpdate = !i.connectedNow && s.connectedVersion != null && s.connectedVersion != i.versionCode
        val state = when {
            !i.listenerAllowed -> HealthState.NO_ACCESS
            !i.connectedNow && i.processAgeMillis < GRACE_MILLIS && !sinceUpdate -> HealthState.CONNECTING
            !i.connectedNow -> HealthState.DISCONNECTED
            i.backgroundRestricted -> HealthState.BATTERY_RESTRICTED
            else -> HealthState.OK
        }
        val disconnected = state == HealthState.DISCONNECTED
        return CaptureHealthReport(
            state,
            since.takeIf { disconnected },
            since?.takeIf { disconnected }?.let { ((i.now - it).coerceAtLeast(0) / HOUR).toInt() },
            sinceUpdate && i.listenerAllowed,
            i,
        )
    }
}

/** Cuando pedir a Android que vuelva a conectar el servicio (NotificationListenerService.requestRebind): con permiso, sin conexion y como maximo cada 30 s. */
object RebindPolicy {
    const val MIN_INTERVAL_MILLIS = 30_000L

    fun shouldRequest(now: Long, lastRequestAt: Long?, allowed: Boolean, connected: Boolean): Boolean =
        allowed && !connected && (lastRequestAt == null || now - lastRequestAt >= MIN_INTERVAL_MILLIS || now < lastRequestAt)
}
