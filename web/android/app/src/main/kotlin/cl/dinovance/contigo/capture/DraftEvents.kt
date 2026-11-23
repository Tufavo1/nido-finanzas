// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

/** Avisa al plugin (si la app está abierta) que cambió la cola de borradores. */
object DraftEvents {
    @Volatile
    var listener: (() -> Unit)? = null

    fun changed() {
        listener?.invoke()
    }
}
