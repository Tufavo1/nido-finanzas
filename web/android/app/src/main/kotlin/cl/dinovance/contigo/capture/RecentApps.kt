// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

/** Persistencia de las apps que avisaron recientemente: SOLO nombre de paquete y hora. */
interface RecentStore {
    fun load(): Map<String, Long>

    fun save(apps: Map<String, Long>)
}

/**
 * Apps que mostraron notificaciones hace poco, para que la persona elija cuales vigilar. Guarda unicamente el
 * paquete y la hora del ultimo aviso: jamas titulo ni texto. Se escribe a disco como maximo una vez por minuto por app.
 */
class RecentApps(private val store: RecentStore, private val max: Int = MAX_APPS) {
    private var cache: MutableMap<String, Long>? = null

    @Synchronized
    fun record(packageName: String, nowMillis: Long) {
        val apps = cache ?: store.load().toMutableMap().also { cache = it }
        val last = apps[packageName]
        if (last != null && nowMillis - last < PERSIST_EVERY_MILLIS) return
        apps[packageName] = nowMillis
        if (apps.size > max) apps.entries.minByOrNull { it.value }?.let { apps.remove(it.key) }
        store.save(apps)
    }

    /** Del mas reciente al mas antiguo. */
    @Synchronized
    fun list(): List<Pair<String, Long>> = (cache ?: store.load().toMutableMap().also { cache = it }).toList().sortedByDescending { it.second }

    @Synchronized
    fun clear() {
        cache = mutableMapOf()
        store.save(emptyMap())
    }

    companion object {
        const val MAX_APPS = 30
        const val PERSIST_EVERY_MILLIS = 60_000L
    }
}
