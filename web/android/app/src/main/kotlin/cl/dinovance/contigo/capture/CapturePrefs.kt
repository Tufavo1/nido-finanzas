// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.content.Context
import android.content.SharedPreferences

/**
 * Preferencias de la captura. Desde la ronda 5 lo que revela habitos o dinero (apps elegidas, apps que avisaron, bancos asociados y
 * detectados, guardado automatico por banco, tope, dueno y ultima persona) vive CIFRADO en [secure] (Keystore); al crear la clase se
 * migra lo que hubiera en claro de versiones anteriores. En SharedPreferences normales queda solo lo que no es personal: direccion
 * del servidor, ocultar en bloqueo, salud del servicio (horas y nombres de clase) y estado del envio.
 */
class CapturePrefs(context: Context, secureStore: (onFailure: (String) -> Unit) -> TextStore) :
    HealthRecorder, RecentStore, AutoConfig, BankStore, cl.dinovance.contigo.sync.SyncStatusStore {
    private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)
    private val fail: (String) -> Unit = { recordFailure(it.take(MAX_CLASS_NAME), System.currentTimeMillis()) }
    val secure = SensitivePrefs(secureStore(fail), SharedLegacyPrefs(prefs), fail).also { it.migrate() }

    fun whitelist(): Set<String> = secure.whitelist()

    fun setWhitelist(packages: Set<String>) = secure.setWhitelist(packages)

    override fun load(): Map<String, Long> = secure.recentApps()

    override fun save(apps: Map<String, Long>) = secure.setRecentApps(apps)

    // ---- Registro automatico por banco (opt-in, apagado por defecto) ----
    fun bankPackage(bank: String): String? = secure.bankPackage(bank)

    fun setBankPackage(bank: String, packageName: String?) = secure.setBankPackage(bank, packageName)

    fun bankAutoSave(bank: String): Boolean = secure.bankAutoSave(bank)

    fun setBankAutoSave(bank: String, enabled: Boolean) = secure.setBankAutoSave(bank, enabled)

    // Bancos detectados por nombre visible (se rehacen en cada busqueda) y paquete asociado a mano (modo aprender / Avanzado)
    override fun detectedPackages(bank: String): Set<String> = secure.detectedPackages(bank)

    fun setDetectedPackages(bank: String, packages: Set<String>) = secure.setDetectedPackages(bank, packages)

    override fun manualPackage(bank: String): String? = bankPackage(bank)

    override fun autoSave(bank: String): Boolean = bankAutoSave(bank)

    override fun setAutoSave(bank: String, enabled: Boolean) = setBankAutoSave(bank, enabled)

    fun hasBankApp(bank: String): Boolean = bankPackage(bank) != null || detectedPackages(bank).isNotEmpty()

    override fun bankOfPackage(packageName: String): String? =
        BankPresets.ALL.firstOrNull { bankPackage(it.id) == packageName || packageName in detectedPackages(it.id) }?.id

    override fun autoEnabled(bank: String): Boolean = bankAutoSave(bank) && hasBankApp(bank)

    /** Lista que realmente vigila el servicio: la elegida por la persona + las apps de banco (detectadas o asociadas). */
    fun effectiveWhitelist(): Set<String> =
        whitelist() + BankPresets.ALL.flatMap { b -> detectedPackages(b.id) + listOfNotNull(bankPackage(b.id)) }

    override fun maxClp(): Long = secure.maxClp() ?: cl.nido.parser.CaptureSettings.DEFAULT_MAX_CLP

    fun setMaxClp(value: Long) = secure.setMaxClp(value)

    /** Direccion del Worker (VITE_API_BASE), solo https; la fija la app. */
    fun apiBase(): String? = prefs.getString(KEY_API_BASE, null)

    fun setApiBase(value: String?) {
        prefs.edit().apply { if (value == null) remove(KEY_API_BASE) else putString(KEY_API_BASE, value) }.apply()
    }

    override fun recordSuccess(nowMillis: Long) {
        prefs.edit().putLong(KEY_SYNC_OK_AT, nowMillis).remove(KEY_SYNC_ERROR).apply()
    }

    override fun recordError(kind: String, nowMillis: Long) {
        prefs.edit().putString(KEY_SYNC_ERROR, kind).putLong(KEY_SYNC_ERROR_AT, nowMillis).apply()
    }

    fun lastSyncOkAt(): Long = prefs.getLong(KEY_SYNC_OK_AT, 0)

    fun lastSyncError(): String? = prefs.getString(KEY_SYNC_ERROR, null)

    /** Usuario/hogar activo (lo fija la app al iniciar sesión); null = sin sesión. */
    fun activeOwner(): String? = secure.activeOwner()

    /** Ultima persona que inicio sesion (solo el usuario, no el hogar); sobrevive a un cierre sin `wipe`. */
    fun lastUser(): String? = secure.lastUser()

    fun setLastUser(user: String?) = secure.setLastUser(user)

    fun setActiveOwner(ownerKey: String?) = secure.setActiveOwner(ownerKey)

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

    /** Latido: el sistema conectó (o desconectó) el servicio. Marca que alguna vez estuvo conectado y con qué versión de la app. */
    fun heartbeat(nowMillis: Long, connected: Boolean, versionCode: Long? = null) {
        val editor = prefs.edit().putLong(KEY_HEARTBEAT, nowMillis).putBoolean(KEY_CONNECTED, connected)
            .putLong(if (connected) KEY_CONNECTED_AT else KEY_DISCONNECTED_AT, nowMillis)
        if (connected) editor.putBoolean(KEY_EVER_CONNECTED, true)
        if (connected && versionCode != null) editor.putLong(KEY_CONNECTED_VERSION, versionCode)
        editor.apply()
    }

    fun lastRebindAt(): Long? = prefs.getLong(KEY_REBIND_AT, 0).takeIf { it > 0 }

    fun setLastRebindAt(nowMillis: Long) {
        prefs.edit().putLong(KEY_REBIND_AT, nowMillis).apply()
    }

    fun health(): HealthSnapshot = HealthSnapshot(
        lastEventAt = prefs.getLong(KEY_LAST_EVENT, 0).takeIf { it > 0 },
        lastHeartbeatAt = prefs.getLong(KEY_HEARTBEAT, 0).takeIf { it > 0 },
        connected = prefs.getBoolean(KEY_CONNECTED, false),
        everConnected = prefs.getBoolean(KEY_EVER_CONNECTED, false),
        failures = prefs.getInt(KEY_FAILURES, 0),
        lastFailureClass = prefs.getString(KEY_LAST_FAILURE_CLASS, null),
        lastFailureAt = prefs.getLong(KEY_LAST_FAILURE_AT, 0).takeIf { it > 0 },
        lastConnectedAt = prefs.getLong(KEY_CONNECTED_AT, 0).takeIf { it > 0 },
        lastDisconnectedAt = prefs.getLong(KEY_DISCONNECTED_AT, 0).takeIf { it > 0 },
        connectedVersion = prefs.getLong(KEY_CONNECTED_VERSION, 0).takeIf { it > 0 },
    )

    private companion object {
        const val NAME = "contigo_capture"
        const val KEY_API_BASE = "api_base"
        const val KEY_SYNC_OK_AT = "sync_ok_at"
        const val KEY_SYNC_ERROR = "sync_error"
        const val KEY_SYNC_ERROR_AT = "sync_error_at"
        const val KEY_HIDE_ON_LOCK = "hide_on_lock"
        const val KEY_LAST_EVENT = "last_event"
        const val KEY_HEARTBEAT = "heartbeat"
        const val KEY_CONNECTED = "connected"
        const val KEY_EVER_CONNECTED = "ever_connected"
        const val KEY_FAILURES = "failures"
        const val KEY_LAST_FAILURE_CLASS = "last_failure_class"
        const val KEY_LAST_FAILURE_AT = "last_failure_at"
        const val KEY_CONNECTED_AT = "connected_at"
        const val KEY_DISCONNECTED_AT = "disconnected_at"
        const val KEY_CONNECTED_VERSION = "connected_version"
        const val KEY_REBIND_AT = "rebind_at"
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
    val lastConnectedAt: Long? = null,
    val lastDisconnectedAt: Long? = null,
    /** versionCode de la app la ultima vez que el sistema conecto el servicio (para notar «desconectado tras actualizar»). */
    val connectedVersion: Long? = null,
)

/** Acceso a las SharedPreferences antiguas para la migracion (SensitivePrefs.migrate). */
private class SharedLegacyPrefs(private val prefs: SharedPreferences) : LegacyPrefs {
    override fun all(): Map<String, Any?> = prefs.all

    override fun remove(keys: Collection<String>): Boolean = prefs.edit().apply { keys.forEach { remove(it) } }.commit()

    override fun version(): Int = prefs.getInt("secure_prefs_version", 0)

    override fun setVersion(version: Int) {
        prefs.edit().putInt("secure_prefs_version", version).apply()
    }
}
