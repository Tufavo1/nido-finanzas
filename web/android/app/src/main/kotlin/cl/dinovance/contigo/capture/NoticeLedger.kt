// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

/**
 * Un aviso que llega al procesador. [key] es la clave de Android (StatusBarNotification.key) y [whenMillis] el `when` que fija la app
 * (Notification.when): juntos distinguen «el sistema reenvio o actualizo el MISMO aviso» de «aviso nuevo con el mismo monto».
 * Sin [key] (caminos antiguos) solo se usa la ventana de 45 s / 2 min de siempre.
 */
data class IncomingNotice(
    val packageName: String,
    val title: String?,
    val text: String?,
    val postedAtMillis: Long,
    val key: String? = null,
    val whenMillis: Long = 0,
    val shape: NoticeShape? = null,
)

/**
 * Registro persistente y cifrado de los avisos ya convertidos en borrador, para deduplicar aunque el proceso muera (la memoria del
 * procesador se pierde) y fuera de la ventana de 45 s. Guarda SOLO resumenes SHA-256 (identidad, «ranura» = paquete+clave, monto),
 * el `when`, el id del borrador y la hora; jamas texto, monto ni clave en claro. Tope de [max] entradas y 48 h. Nunca lanza.
 *
 * R7: agregar lee con readChecked; ante un fallo PASAJERO del Keystore NO reescribe el registro (antes lo dejaba vacio y el mismo
 * aviso podia volver a guardarse: gasto duplicado). La entrada nueva espera en memoria ([CheckedJsonList]) y ya deduplica en este
 * proceso; se escribe en el siguiente cambio que logre leer.
 */
class NoticeLedger(store: TextStore, private val max: Int = MAX, onFailure: (String) -> Unit = {}) {
    private val entries = CheckedJsonList(store, ::parse, ::encode, max, onFailure)

    data class Entry(val id: String, val slot: String, val money: String, val whenMillis: Long, val draftId: String, val at: Long)

    @Synchronized
    fun has(id: String): Boolean = load().any { it.id == id }

    /** Ultimo borrador de la misma ranura (paquete+clave) y monto, mas nuevo que [since]. */
    @Synchronized
    fun lastInSlot(slot: String, money: String, since: Long): Entry? = load().lastOrNull { it.slot == slot && it.money == money && it.at >= since }

    @Synchronized
    fun add(entry: Entry) {
        entries.update { items -> (items.filter { entry.at - it.at < MAX_AGE_MILLIS && it.id != entry.id } + entry).takeLast(max) }
    }

    private fun load(): List<Entry> = entries.view()

    /** Lanza si el JSON esta dañado. */
    private fun parse(raw: String): List<Entry> {
        val a = JSONArray(raw)
        return (0 until a.length()).map { i -> a.getJSONObject(i).let { Entry(it.getString("i"), it.getString("s"), it.getString("m"), it.optLong("w"), it.getString("d"), it.getLong("a")) } }
    }

    private fun encode(items: List<Entry>): String {
        val a = JSONArray()
        items.forEach { a.put(JSONObject().put("i", it.id).put("s", it.slot).put("m", it.money).put("w", it.whenMillis).put("d", it.draftId).put("a", it.at)) }
        return a.toString()
    }

    companion object {
        const val MAX = 200
        const val MAX_AGE_MILLIS = 48L * 60 * 60 * 1000
        private val SPACES = Regex("\\s+")

        fun sha(vararg parts: Any?): String =
            MessageDigest.getInstance("SHA-256").digest(parts.joinToString("\u0000").toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

        /** Contenido normalizado (minusculas, espacios simples) del titulo y el cuerpo. */
        fun contentOf(title: String?, text: String?): String = listOfNotNull(title, text).joinToString("\n").lowercase().replace(SPACES, " ").trim()
    }
}
