// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

/** Configuracion del registro automatico por banco (la implementa CapturePrefs). */
interface AutoConfig {
    fun bankOfPackage(packageName: String): String?

    fun autoEnabled(bank: String): Boolean

    fun maxClp(): Long
}

/** Clave de comercio: minusculas, sin tildes, solo letras y numeros. Igual que `norm` de categorize.ts. */
object MerchantKey {
    private val MARKS = Regex("\\p{M}")
    private val NON_ALNUM = Regex("[^a-z0-9]+")

    fun of(text: String): String =
        NON_ALNUM.replace(MARKS.replace(Normalizer.normalize(text.lowercase(), Normalizer.Form.NFD), ""), " ").trim()
}

/**
 * Lo que la app le entrega al plugin para guardar gastos con la app cerrada: dueno, hogar, quien paga y las categorias que
 * la persona ya uso por comercio (clave exacta, o «w:primera palabra»). Sin categoria aprendida el gasto se pregunta.
 */
data class AutoProfile(
    val ownerKey: String,
    val userId: String,
    val householdId: String,
    val paidBy: String,
    val shared: Boolean,
    val categories: Map<String, String>,
) {
    fun categoryFor(merchant: String?): String? {
        val key = MerchantKey.of(merchant.orEmpty())
        if (key.isEmpty()) return null
        categories[key]?.let { return it }
        val first = key.substringBefore(' ')
        return if (first.length >= 4) categories["w:$first"] else null
    }

    fun toJson(): String = JSONObject()
        .put("ownerKey", ownerKey).put("userId", userId).put("householdId", householdId).put("paidBy", paidBy).put("shared", shared)
        .put("categories", JSONObject(categories as Map<*, *>))
        .toString()

    companion object {
        private val ID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
        const val MAX_CATEGORIES = 1000

        /** null si algo no tiene la forma exacta (frontera con la WebView). */
        fun parse(json: String): AutoProfile? {
            return try {
            val o = JSONObject(json)
            val cats = o.getJSONObject("categories")
            val map = LinkedHashMap<String, String>()
            for (k in cats.keys()) {
                val v = cats.getString(k)
                if (k.length > 80 || !ID.matches(v)) return null
                map[k] = v
            }
            val p = AutoProfile(o.getString("ownerKey"), o.getString("userId"), o.getString("householdId"), o.getString("paidBy"), o.getBoolean("shared"), map)
            if (map.size > MAX_CATEGORIES || !ID.matches(p.userId) || !ID.matches(p.householdId) || !ID.matches(p.paidBy)) null else p
            } catch (e: Exception) {
                null
            }
        }

        fun fromJs(ownerKey: String, userId: String, householdId: String, paidBy: String, shared: Boolean, entries: JSONArray): AutoProfile? {
            val map = LinkedHashMap<String, String>()
            for (i in 0 until entries.length()) {
                val e = entries.optJSONObject(i) ?: return null
                map[e.optString("key")] = e.optString("categoryId")
            }
            return parse(AutoProfile(ownerKey, userId, householdId, paidBy, shared, map).toJson())
        }
    }
}
