// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import org.json.JSONObject

/** Un gasto guardado automaticamente (para la lista «Guardados automaticamente» con Deshacer). Sin texto del aviso. */
data class AutoSavedEntry(
    val id: String,
    val amountClp: Long,
    val note: String,
    val at: Long,
    val synced: Boolean,
    /** Usuario/hogar al guardar: otra persona en el mismo telefono no lo ve ni lo deshace (R3-08). */
    val ownerKey: String? = null,
    /** La base lo rechazo (R3-09). */
    val rejected: Boolean = false,
    /** Ya se aviso a la pareja (notify); false mientras se reintenta (R3-01). */
    val notified: Boolean = false,
)

/** Almacen minimo de texto (SecureKeyValueStore en produccion). */
interface TextStore {
    fun read(): String?

    fun write(value: String?)
}

/** Registro cifrado de lo guardado solo: tope de 50 y 14 dias. El id es el del gasto (draftExpenseId). */
class AutoSavedLog(private val store: TextStore, private val clock: () -> Long) {
    @Synchronized
    fun list(): List<AutoSavedEntry> = load().filter { clock() - it.at < MAX_AGE_MILLIS }

    @Synchronized
    fun add(entry: AutoSavedEntry) = save((listOf(entry) + load().filterNot { it.id == entry.id }).take(MAX))

    @Synchronized
    fun listFor(owner: String?): List<AutoSavedEntry> = if (owner == null) emptyList() else list().filter { it.ownerKey == owner }

    @Synchronized
    fun markSynced(id: String) = save(load().map { if (it.id == id) it.copy(synced = true, rejected = false) else it })

    @Synchronized
    fun markRejected(id: String) = save(load().map { if (it.id == id) it.copy(rejected = true) else it })

    @Synchronized
    fun markNotified(id: String) = save(load().map { if (it.id == id) it.copy(notified = true) else it })

    @Synchronized
    fun remove(id: String) = save(load().filterNot { it.id == id })

    @Synchronized
    fun clear() = store.write(null)

    private fun load(): List<AutoSavedEntry> = try {
        val a = JSONArray(store.read() ?: "[]")
        (0 until a.length()).map { val o = a.getJSONObject(it); AutoSavedEntry(o.getString("id"), o.getLong("amount"), o.getString("note"), o.getLong("at"), o.getBoolean("synced"), if (o.isNull("owner")) null else o.optString("owner"), o.optBoolean("rejected", false), o.optBoolean("notified", false)) }
    } catch (e: Exception) {
        emptyList()
    }

    private fun save(items: List<AutoSavedEntry>) {
        val a = JSONArray()
        items.filter { clock() - it.at < MAX_AGE_MILLIS }.forEach { a.put(JSONObject().put("id", it.id).put("amount", it.amountClp).put("note", it.note).put("at", it.at).put("synced", it.synced).put("owner", it.ownerKey ?: JSONObject.NULL).put("rejected", it.rejected).put("notified", it.notified)) }
        store.write(a.toString())
    }

    private companion object {
        const val MAX = 50
        const val MAX_AGE_MILLIS = 14L * 24 * 60 * 60 * 1000
    }
}
