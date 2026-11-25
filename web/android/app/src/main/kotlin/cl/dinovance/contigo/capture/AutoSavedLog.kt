// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import cl.nido.parser.Kind
import org.json.JSONArray
import org.json.JSONObject

/** Un gasto o ingreso extra guardado automaticamente (lista «Guardados automaticamente» con Deshacer). Sin texto del aviso. */
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
    /** EXPENSE (fila de expenses) o INCOME (fila de incomes, «Ingreso extra»). Un registro antiguo sin tipo es un gasto. */
    val kind: Kind = Kind.EXPENSE,
)

/** Almacen minimo de texto (SecureKeyValueStore en produccion). */
interface TextStore {
    fun read(): String?

    /** Como [read], pero LANZA si no se pudo leer (en vez de responder «no hay valor»): para no pisar lo guardado (B3). */
    fun readChecked(): String? = read()

    fun write(value: String?)

    /** Como [write], pero LANZA si no quedo escrito: para no informar «borrado» cuando no se borro. */
    fun writeChecked(value: String?) = write(value)
}

/**
 * Registro cifrado de lo guardado solo: tope de 50 y 14 dias. El id es el del gasto (draftExpenseId). Cada cambio lee con
 * readChecked y, ante un fallo pasajero del Keystore, NO pisa el historial: espera en memoria (R7, [CheckedJsonList]).
 */
class AutoSavedLog(store: TextStore, onFailure: (String) -> Unit = {}, private val clock: () -> Long) {
    private val entries = CheckedJsonList(store, ::parse, ::encode, MAX, onFailure)

    @Synchronized
    fun list(): List<AutoSavedEntry> = entries.view().filter { clock() - it.at < MAX_AGE_MILLIS }

    @Synchronized
    fun add(entry: AutoSavedEntry) = change { items -> (listOf(entry) + items.filterNot { it.id == entry.id }).take(MAX) }

    @Synchronized
    fun listFor(owner: String?): List<AutoSavedEntry> = if (owner == null) emptyList() else list().filter { it.ownerKey == owner }

    @Synchronized
    fun markSynced(id: String) = change { items -> items.map { if (it.id == id) it.copy(synced = true, rejected = false) else it } }

    @Synchronized
    fun markRejected(id: String) = change { items -> items.map { if (it.id == id) it.copy(rejected = true) else it } }

    @Synchronized
    fun markNotified(id: String) = change { items -> items.map { if (it.id == id) it.copy(notified = true) else it } }

    /**
     * La app abierta tomo este guardado (lo inserto o lo dejo en SU cola sin conexion) y quito el borrador: el telefono ya no lo
     * enviara ni avisara a la pareja, asi que deja de figurar «se enviara solo» (QA 2026-11-24). Solo el dueño [owner] y solo si
     * seguia pendiente: uno rechazado o ya enviado no cambia. true = se marco.
     */
    @Synchronized
    fun markTakenByApp(id: String, owner: String?): Boolean {
        if (list().none { it.id == id && owner != null && it.ownerKey == owner && !it.synced && !it.rejected }) return false
        change { items -> items.map { if (it.id == id) it.copy(synced = true, notified = true) else it } }
        return true
    }

    @Synchronized
    fun remove(id: String) = change { items -> items.filterNot { it.id == id } }

    @Synchronized
    fun clear() = entries.clear()

    /** Nunca lanza (lo llama la captura despues de guardar el gasto). Lo vencido se poda al escribir, como antes. */
    private fun change(edit: (List<AutoSavedEntry>) -> List<AutoSavedEntry>) {
        entries.update { items -> edit(items).filter { clock() - it.at < MAX_AGE_MILLIS } }
    }

    /** Lanza si el JSON esta dañado. */
    private fun parse(raw: String): List<AutoSavedEntry> {
        val a = JSONArray(raw)
        return (0 until a.length()).map { val o = a.getJSONObject(it); AutoSavedEntry(o.getString("id"), o.getLong("amount"), o.getString("note"), o.getLong("at"), o.getBoolean("synced"), if (o.isNull("owner")) null else o.optString("owner"), o.optBoolean("rejected", false), o.optBoolean("notified", false), kindOf(o.optString("kind"))) }
    }

    private fun encode(items: List<AutoSavedEntry>): String {
        val a = JSONArray()
        items.forEach { a.put(JSONObject().put("id", it.id).put("amount", it.amountClp).put("note", it.note).put("at", it.at).put("synced", it.synced).put("owner", it.ownerKey ?: JSONObject.NULL).put("rejected", it.rejected).put("notified", it.notified).put("kind", it.kind.name)) }
        return a.toString()
    }

    private fun kindOf(name: String): Kind = if (name == Kind.INCOME.name) Kind.INCOME else Kind.EXPENSE

    private companion object {
        const val MAX = 50
        const val MAX_AGE_MILLIS = 14L * 24 * 60 * 60 * 1000
    }
}
