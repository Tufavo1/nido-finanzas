// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import org.json.JSONObject

/**
 * [TextStore] que nunca lanza: si el Keystore se invalido o el disco falla, leer devuelve «no hay valor» y escribir no guarda.
 * [onFailure] recibe SOLO el nombre de la clase de la excepcion (jamas el mensaje ni el valor).
 */
class SafeTextStore(
    private val readFn: () -> String?,
    private val writeFn: (String?) -> Unit,
    private val onFailure: (String) -> Unit = {},
) : TextStore {
    override fun read(): String? = try {
        readFn()
    } catch (e: Exception) {
        onFailure(e.javaClass.simpleName)
        null
    }

    override fun readChecked(): String? = readFn()

    override fun writeChecked(value: String?) = writeFn(value)

    override fun write(value: String?) {
        try {
            writeFn(value)
        } catch (e: Exception) {
            onFailure(e.javaClass.simpleName)
        }
    }
}

/** Las SharedPreferences en claro de versiones anteriores, solo para migrarlas (ronda 5). */
interface LegacyPrefs {
    fun all(): Map<String, Any?>

    /** Borra esas claves y lo escribe a disco de forma sincrona; false si no quedo escrito. */
    fun remove(keys: Collection<String>): Boolean

    fun version(): Int

    fun setVersion(version: Int)
}

enum class MigrationResult { NOT_NEEDED, MIGRATED, DEFERRED }

/**
 * Preferencias de captura que revelan habitos o dinero, cifradas (AES-GCM con clave de Android Keystore, via [store]): apps
 * elegidas, apps que avisaron hace poco, bancos asociados/detectados y su guardado automatico, tope, dueno activo y ultima persona.
 * Todo en un solo documento JSON cifrado, con copia en memoria (se lee una vez por proceso).
 *
 * Si el bloque no se puede descifrar (clave perdida tras restaurar o invalidada) se vuelve a los valores por defecto: lista vacia,
 * guardado automatico APAGADO, tope por defecto y sin dueno. Nunca lanza: los fallos se cuentan por nombre de clase.
 */
class SensitivePrefs(
    private val store: TextStore,
    private val legacy: LegacyPrefs? = null,
    private val onFailure: (String) -> Unit = {},
) {
    private var cache: JSONObject? = null
    /** false: [cache] NO salio de una lectura buena (fallo pasajero): no sirve de base para reescribir el documento (B3). */
    private var trusted = false

    @Synchronized fun whitelist(): Set<String> = strings(doc().optJSONArray(F_WHITELIST))

    @Synchronized fun setWhitelist(packages: Set<String>) = edit { it.put(F_WHITELIST, JSONArray(packages.sorted())) }

    @Synchronized
    fun recentApps(): Map<String, Long> {
        val o = doc().optJSONObject(F_RECENT) ?: return emptyMap()
        return o.keys().asSequence().associateWith { o.optLong(it) }.filterValues { it > 0 }
    }

    @Synchronized fun setRecentApps(apps: Map<String, Long>) = edit { it.put(F_RECENT, JSONObject().apply { apps.forEach { (k, v) -> put(k, v) } }) }

    @Synchronized fun bankPackage(bank: String): String? = doc().optJSONObject(F_BANK_PKG)?.optString(bank)?.ifEmpty { null }

    @Synchronized fun setBankPackage(bank: String, packageName: String?) = editMap(F_BANK_PKG) { if (packageName == null) it.remove(bank) else it.put(bank, packageName) }

    @Synchronized fun bankAutoSave(bank: String): Boolean = doc().optJSONObject(F_BANK_AUTO)?.optBoolean(bank, false) ?: false

    @Synchronized fun setBankAutoSave(bank: String, enabled: Boolean) = editMap(F_BANK_AUTO) { it.put(bank, enabled) }

    @Synchronized fun detectedPackages(bank: String): Set<String> = strings(doc().optJSONObject(F_BANK_DET)?.optJSONArray(bank))

    @Synchronized
    fun setDetectedPackages(bank: String, packages: Set<String>) {
        if (detectedPackages(bank) == packages) return // se rehace en cada busqueda: no reescribir si no cambio
        editMap(F_BANK_DET) { if (packages.isEmpty()) it.remove(bank) else it.put(bank, JSONArray(packages.sorted())) }
    }

    /** null = tope por defecto. */
    @Synchronized fun maxClp(): Long? = doc().optLong(F_CAP, 0).takeIf { it > 0 }

    @Synchronized fun setMaxClp(value: Long) = edit { it.put(F_CAP, value) }

    @Synchronized fun activeOwner(): String? = doc().optString(F_OWNER).ifEmpty { null }

    @Synchronized fun setActiveOwner(ownerKey: String?) {
        if (activeOwner() == ownerKey) return
        edit { if (ownerKey == null) it.remove(F_OWNER) else it.put(F_OWNER, ownerKey) }
    }

    @Synchronized fun lastUser(): String? = doc().optString(F_LAST_USER).ifEmpty { null }

    @Synchronized fun setLastUser(user: String?) {
        if (lastUser() == user) return
        edit { if (user == null) it.remove(F_LAST_USER) else it.put(F_LAST_USER, user) }
    }

    /** Cierre de sesion o borrado de cuenta: no queda nada (tampoco en memoria). */
    @Synchronized
    fun clearAll() {
        cache = JSONObject()
        trusted = true
        store.write(null)
        // Si quedaba algo en claro de una version anterior (migracion aplazada), tambien se va
        legacy?.let { l -> l.all().keys.filter(::isSensitiveLegacy).takeIf { it.isNotEmpty() }?.let { l.remove(it) } }
    }

    /** Cambio de cuenta: se borra la configuracion de la persona anterior. Las apps instaladas detectadas se conservan (son del telefono). */
    @Synchronized
    fun clearAccountConfig() = edit(evenIfUnreadable = true) { o -> listOf(F_WHITELIST, F_RECENT, F_BANK_PKG, F_BANK_AUTO, F_CAP).forEach { o.remove(it) } }

    /** Persistencia para [RecentApps] (solo paquete y hora). */
    fun asRecentStore(): RecentStore = object : RecentStore {
        override fun load(): Map<String, Long> = recentApps()
        override fun save(apps: Map<String, Long>) = setRecentApps(apps)
    }

    /**
     * Migracion versionada e idempotente de lo sensible que quedo en claro: (1) se funde con lo cifrado (lo cifrado gana: es mas nuevo),
     * (2) se escribe cifrado y se comprueba leyendolo de vuelta, (3) recien entonces se borra la copia en claro y se marca la version.
     * Si el cifrado falla, la copia en claro se conserva (sin perder datos), se usa en memoria y se reintenta en el siguiente arranque.
     * Limite: borrar de SharedPreferences reescribe el archivo, pero la memoria flash puede conservar bloques viejos.
     */
    @Synchronized
    fun migrate(): MigrationResult {
        val l = legacy ?: return MigrationResult.NOT_NEEDED
        val plain = try {
            l.all().filterKeys(::isSensitiveLegacy)
        } catch (e: Exception) {
            onFailure(e.javaClass.simpleName)
            return MigrationResult.DEFERRED
        }
        if (plain.isEmpty()) {
            if (l.version() < VERSION) l.setVersion(VERSION)
            return MigrationResult.NOT_NEEDED
        }
        val base = trustedDoc()
        val merged = JSONObject((base ?: doc()).toString())
        plain.forEach { (k, v) -> mergeLegacy(merged, k, v) }
        cache = merged
        trusted = base != null
        // Sin leer lo cifrado no se escribe: se usa en memoria y se reintenta en el siguiente arranque (lo cifrado gana)
        if (base == null) {
            onFailure("MigrationDeferred")
            return MigrationResult.DEFERRED
        }
        val expected = merged.toString()
        store.write(expected)
        if (store.read() != expected) {
            onFailure("MigrationDeferred")
            return MigrationResult.DEFERRED
        }
        if (!l.remove(plain.keys)) {
            onFailure("MigrationDeferred")
            return MigrationResult.DEFERRED
        }
        l.setVersion(VERSION)
        return MigrationResult.MIGRATED
    }

    private fun mergeLegacy(o: JSONObject, key: String, value: Any?) {
        when {
            key == L_WHITELIST -> if (!o.has(F_WHITELIST)) o.put(F_WHITELIST, JSONArray(stringSet(value).sorted()))
            key == L_RECENT -> if (!o.has(F_RECENT)) o.put(F_RECENT, JSONObject().apply {
                stringSet(value).forEach { e -> e.substringAfterLast('|', "").toLongOrNull()?.let { put(e.substringBeforeLast('|'), it) } }
            })
            key == L_CAP -> if (!o.has(F_CAP)) (value as? Number)?.toLong()?.takeIf { it > 0 }?.let { o.put(F_CAP, it) }
            key == L_OWNER -> if (!o.has(F_OWNER)) (value as? String)?.let { o.put(F_OWNER, it) }
            key == L_LAST_USER -> if (!o.has(F_LAST_USER)) (value as? String)?.let { o.put(F_LAST_USER, it) }
            key.startsWith(L_BANK_PKG) -> sub(o, F_BANK_PKG, key.removePrefix(L_BANK_PKG)) { m, b -> (value as? String)?.let { m.put(b, it) } }
            key.startsWith(L_BANK_AUTO) -> sub(o, F_BANK_AUTO, key.removePrefix(L_BANK_AUTO)) { m, b -> (value as? Boolean)?.let { m.put(b, it) } }
            key.startsWith(L_BANK_DET) -> sub(o, F_BANK_DET, key.removePrefix(L_BANK_DET)) { m, b -> m.put(b, JSONArray(stringSet(value).sorted())) }
        }
    }

    private inline fun sub(o: JSONObject, field: String, bank: String, put: (JSONObject, String) -> Unit) {
        val m = o.optJSONObject(field) ?: JSONObject().also { o.put(field, it) }
        if (!m.has(bank)) put(m, bank)
    }

    private fun stringSet(v: Any?): Set<String> = (v as? Set<*>)?.filterIsInstance<String>()?.toSet() ?: emptySet()

    private fun strings(a: JSONArray?): Set<String> = if (a == null) emptySet() else (0 until a.length()).mapNotNull { a.optString(it).ifEmpty { null } }.toSet()

    // Una lectura fallida NO se cachea como documento vacio: se reintenta en el proximo acceso (B3).
    private fun doc(): JSONObject = trustedDoc() ?: cache ?: JSONObject()

    /** El documento leido de verdad (y se cachea), o null si la lectura fallo. */
    private fun trustedDoc(): JSONObject? {
        if (trusted) cache?.let { return it }
        return load()?.also { cache = it; trusted = true }
    }

    private fun load(): JSONObject? = try {
        store.readChecked()?.let { JSONObject(it) } ?: JSONObject()
    } catch (e: Exception) {
        onFailure(e.javaClass.simpleName)
        null
    }

    /**
     * Cambia el documento sobre lo leido de verdad. Si no se pudo leer, el cambio vale solo en memoria y NO se escribe: escribir
     * sobre un documento vacio borraria la configuracion real (B3). [evenIfUnreadable]: borrar datos de otra persona se escribe igual.
     */
    private inline fun edit(evenIfUnreadable: Boolean = false, change: (JSONObject) -> Unit) {
        val base = trustedDoc()
        val next = JSONObject((base ?: if (evenIfUnreadable) JSONObject() else cache ?: JSONObject()).toString())
        change(next)
        next.put(F_VERSION, VERSION)
        cache = next
        if (base == null && !evenIfUnreadable) {
            trusted = false
            onFailure("EditDeferred")
            return
        }
        trusted = true
        store.write(next.toString())
    }

    private inline fun editMap(field: String, change: (JSONObject) -> Unit) = edit { o ->
        val m = o.optJSONObject(field) ?: JSONObject()
        change(m)
        o.put(field, m)
    }

    companion object {
        /** Version del formato cifrado y de la migracion (SharedPreferences `secure_prefs_version`). */
        const val VERSION = 1
        /** Clave en el almacen seguro de la sesion: `wipe()` (que vacia ese almacen) tambien lo borra. */
        const val STORE_KEY = "capture-prefs"

        private const val F_VERSION = "v"
        private const val F_WHITELIST = "whitelist"
        private const val F_RECENT = "recent"
        private const val F_BANK_PKG = "bankPkg"
        private const val F_BANK_AUTO = "bankAuto"
        private const val F_BANK_DET = "bankDet"
        private const val F_CAP = "autoCap"
        private const val F_OWNER = "owner"
        private const val F_LAST_USER = "lastUser"

        // Claves antiguas en claro (CapturePrefs hasta la v1.2.12)
        const val L_WHITELIST = "whitelist"
        const val L_RECENT = "recent_apps"
        const val L_CAP = "auto_cap"
        const val L_OWNER = "active_owner"
        const val L_LAST_USER = "last_user"
        const val L_BANK_PKG = "bank_pkg_"
        const val L_BANK_AUTO = "bank_auto_"
        const val L_BANK_DET = "bank_det_"

        fun isSensitiveLegacy(key: String): Boolean =
            key in setOf(L_WHITELIST, L_RECENT, L_CAP, L_OWNER, L_LAST_USER) || key.startsWith(L_BANK_PKG) || key.startsWith(L_BANK_AUTO) || key.startsWith(L_BANK_DET)
    }
}
