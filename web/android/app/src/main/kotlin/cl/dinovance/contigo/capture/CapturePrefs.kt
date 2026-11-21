// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.content.Context
import android.content.SharedPreferences

/**
 * Preferencias no secretas de la captura: lista blanca de paquetes, privacidad y salud del servicio.
 * Son SharedPreferences normales porque no contienen montos, textos ni credenciales.
 */
class CapturePrefs(context: Context) : HealthRecorder, RecentStore {
    private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun whitelist(): Set<String> = prefs.getStringSet(KEY_WHITELIST, emptySet()).orEmpty().toSet()

    fun setWhitelist(packages: Set<String>) {
        prefs.edit().putStringSet(KEY_WHITELIST, packages).apply()
    }

    override fun load(): Map<String, Long> = prefs.getStringSet(KEY_RECENT, emptySet()).orEmpty()
        .mapNotNull { entry -> entry.substringAfterLast('|', "").toLongOrNull()?.let { entry.substringBeforeLast('|') to it } }
        .toMap()

    override fun save(apps: Map<String, Long>) {
        prefs.edit().putStringSet(KEY_RECENT, apps.map { "${it.key}|${it.value}" }.toSet()).apply()
    }

    /** Usuario/hogar activo (lo fija la app al iniciar sesión); null = sin sesión. */
    fun activeOwner(): String? = prefs.getString(KEY_OWNER, null)

    /** Ultima persona que inicio sesion (solo el usuario, no el hogar); sobrevive a un cierre sin `wipe`. */
    fun lastUser(): String? = prefs.getString(KEY_LAST_USER, null)

    fun setLastUser(user: String?) {
        prefs.edit().apply { if (user == null) remove(KEY_LAST_USER) else putString(KEY_LAST_USER, user) }.apply()
    }

    fun setActiveOwner(ownerKey: String?) {
        prefs.edit().apply { if (ownerKey == null) remove(KEY_OWNER) else putString(KEY_OWNER, ownerKey) }.apply()
    }

    /** Decisión 5: ocultar montos en la pantalla de bloqueo, activado por defecto. */
    fun hideOnLockScreen(): Boolean = prefs.getBoolean(KEY_HIDE_ON_LOCK, true)

    fun setHideOnLockScreen(hide: Boolean) {
        prefs.edit().putBoolean(KEY_HIDE_ON_LOCK, hide).apply()
    }

    override fun recordEvent(nowMillis: Long) {
        prefs.edit().putLong(KEY_LAST_EVENT, nowMillis).apply()
    }

    override fun recordFailure(errorClass: String, nowMillis: Long) {
        prefs.edit()
            .putInt(KEY_FAILURES, prefs.getInt(KEY_FAILURES, 0) + 1)
            .putString(KEY_LAST_FAILURE_CLASS, errorClass.take(MAX_CLASS_NAME))
            .putLong(KEY_LAST_FAILURE_AT, nowMillis)
            .apply()
    }

    /** Latido: el sistema conectó el servicio (o recibió un aviso). Marca que alguna vez estuvo conectado. */
    fun heartbeat(nowMillis: Long, connected: Boolean) {
        val editor = prefs.edit().putLong(KEY_HEARTBEAT, nowMillis).putBoolean(KEY_CONNECTED, connected)
        if (connected) editor.putBoolean(KEY_EVER_CONNECTED, true)
        editor.apply()
    }

    fun health(): HealthSnapshot = HealthSnapshot(
        lastEventAt = prefs.getLong(KEY_LAST_EVENT, 0).takeIf { it > 0 },
        lastHeartbeatAt = prefs.getLong(KEY_HEARTBEAT, 0).takeIf { it > 0 },
        connected = prefs.getBoolean(KEY_CONNECTED, false),
        everConnected = prefs.getBoolean(KEY_EVER_CONNECTED, false),
        failures = prefs.getInt(KEY_FAILURES, 0),
        lastFailureClass = prefs.getString(KEY_LAST_FAILURE_CLASS, null),
        lastFailureAt = prefs.getLong(KEY_LAST_FAILURE_AT, 0).takeIf { it > 0 },
    )

    private companion object {
        const val NAME = "contigo_capture"
        const val KEY_WHITELIST = "whitelist"
        const val KEY_OWNER = "active_owner"
        const val KEY_LAST_USER = "last_user"
        const val KEY_RECENT = "recent_apps"
        const val KEY_HIDE_ON_LOCK = "hide_on_lock"
        const val KEY_LAST_EVENT = "last_event"
        const val KEY_HEARTBEAT = "heartbeat"
        const val KEY_CONNECTED = "connected"
        const val KEY_EVER_CONNECTED = "ever_connected"
        const val KEY_FAILURES = "failures"
        const val KEY_LAST_FAILURE_CLASS = "last_failure_class"
        const val KEY_LAST_FAILURE_AT = "last_failure_at"
        const val MAX_CLASS_NAME = 64
    }
}

/** Salud del servicio de notificaciones, sin ningún dato del usuario. */
data class HealthSnapshot(
    val lastEventAt: Long?,
    val lastHeartbeatAt: Long?,
    val connected: Boolean,
    val everConnected: Boolean,
    val failures: Int,
    val lastFailureClass: String?,
    val lastFailureAt: Long?,
)
