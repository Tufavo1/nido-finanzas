// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import org.json.JSONObject

/**
 * Memoria de compras para la regla CROSS-FUENTE: la misma compra puede avisar dos veces, por la app del banco y por Billetera Google
 * (con comercios escritos distinto: «SHELL VESPUCIO» y «Shell Vespucio 1828 F1»). Dos gastos de paquetes DISTINTOS, con el MISMO monto
 * y con postTime a menos de [WINDOW_MILLIS] son la misma compra: gana el primero.
 *
 * - Emparejamiento uno a uno: cada compra recordada acepta como mucho UN aviso de cada otra fuente ([Entry.claimedBy]); asi dos compras
 *   reales del mismo monto en el banco, cada una con su espejo en Wallet, siguen siendo dos.
 * - Persistente y cifrada (almacen de avisos vistos, no se borra al cerrar sesion, igual que [NoticeLedger]): un gasto que ya se guardo
 *   solo y se envio (salio de la bandeja) sigue tapando a su espejo, y sobrevive a la muerte del proceso.
 * - Guarda SOLO resumenes SHA-256 de la fuente y del monto, postTime, el id del borrador y la hora: jamas monto, comercio ni paquete
 *   en claro. Tope de [max] entradas y [MAX_AGE_MILLIS] (el reescaneo mira avisos de hasta 24 h). Nunca lanza.
 */
class PurchaseMemory(store: TextStore, private val max: Int = MAX, onFailure: (String) -> Unit = {}) {
    // R7: leer-modificar-escribir seguro; un fallo pasajero del Keystore no borra las compras recordadas (anti-duplicados)
    private val entries = CheckedJsonList(store, ::parse, ::encode, max, onFailure)

    /** [mirror]: aviso que ya se tomo como duplicado de otra fuente; solo sirve para reconocer su propio reenvio, nunca para emparejar. */
    data class Entry(val source: String, val money: String, val postedAt: Long, val draftId: String, val at: Long, val claimedBy: Set<String> = emptySet(), val mirror: Boolean = false)

    /**
     * Busca la compra de OTRA fuente con el mismo monto y postTime a menos de 10 min (la mas cercana que esta fuente no haya tomado ya),
     * la marca como tomada por [sourcePackage] y devuelve su borrador. Tambien reconoce el reenvio exacto de un aviso que ya fue espejo.
     * null = no hay pareja: es una compra nueva.
     */
    @Synchronized
    fun claim(sourcePackage: String, amountClp: Long, postedAt: Long, now: Long): Entry? {
        val src = sourceOf(sourcePackage)
        val money = moneyOf(amountClp)
        val items = load(now)
        items.firstOrNull { it.mirror && it.source == src && it.money == money && it.postedAt == postedAt }?.let { return it }
        val match = items.filter { !it.mirror && it.source != src && it.money == money && src !in it.claimedBy && kotlin.math.abs(it.postedAt - postedAt) < WINDOW_MILLIS }
            .minByOrNull { kotlin.math.abs(it.postedAt - postedAt) } ?: return null
        val mirror = Entry(src, money, postedAt, match.draftId, now, mirror = true)
        // Idempotente (se puede volver a aplicar si la escritura falla): marca la compra emparejada y agrega el espejo una sola vez
        entries.update { list ->
            val marked = list.map { if (it == match) it.copy(claimedBy = it.claimedBy + src) else it }
            prune(if (mirror in marked) marked else marked + mirror, now)
        }
        return match
    }

    /** Recuerda un gasto que se convirtio en borrador. */
    @Synchronized
    fun add(sourcePackage: String, amountClp: Long, postedAt: Long, draftId: String, now: Long) {
        val entry = Entry(sourceOf(sourcePackage), moneyOf(amountClp), postedAt, draftId, now)
        entries.update { list -> prune(if (entry in list) list else list + entry, now) }
    }

    private fun load(now: Long): List<Entry> = entries.view().filter { now - it.at < MAX_AGE_MILLIS }

    private fun prune(items: List<Entry>, now: Long): List<Entry> = items.filter { now - it.at < MAX_AGE_MILLIS }.takeLast(max)

    /** Lanza si el JSON esta dañado. */
    private fun parse(raw: String): List<Entry> {
        val a = JSONArray(raw)
        return (0 until a.length()).map { i ->
            val o = a.getJSONObject(i)
            val claimed = o.optJSONArray("c")?.let { c -> (0 until c.length()).map { c.getString(it) }.toSet() }.orEmpty()
            Entry(o.getString("s"), o.getString("m"), o.getLong("p"), o.getString("d"), o.getLong("a"), claimed, o.optBoolean("x"))
        }
    }

    private fun encode(items: List<Entry>): String {
        val a = JSONArray()
        items.forEach { e ->
            a.put(JSONObject().put("s", e.source).put("m", e.money).put("p", e.postedAt).put("d", e.draftId).put("a", e.at).put("c", JSONArray(e.claimedBy.toList())).put("x", e.mirror))
        }
        return a.toString()
    }

    companion object {
        const val MAX = 200
        /** Ventana de la regla cross-fuente (ver docs/mobile/backend-android.md, «Billetera Google»). */
        const val WINDOW_MILLIS = 10L * 60 * 1000
        const val MAX_AGE_MILLIS = 26L * 60 * 60 * 1000

        private fun sourceOf(pkg: String) = NoticeLedger.sha("purchase-source", pkg)

        private fun moneyOf(amount: Long) = NoticeLedger.sha("purchase-money", amount)
    }
}
