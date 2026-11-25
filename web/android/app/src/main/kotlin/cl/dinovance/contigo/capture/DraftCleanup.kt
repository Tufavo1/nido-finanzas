// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import cl.dinovance.contigo.sync.ExpenseSyncer

/**
 * «Vaciar movimientos pendientes» (contrato `clearPending` del front): borra SOLO los borradores PENDIENTES del dueno activo, en una
 * sola escritura del repositorio (sin ventana de carrera con «Guardar» ni con el envio). Un borrador CONFIRMED (guardado desde la
 * notificacion y aun no enviado) jamas se borra aqui: es un gasto que la persona ya decidio guardar (falla QA 2026-11-24).
 * «Borrar lo capturado» de Seguridad sigue siendo `clearCaptured` (borrado total, por privacidad).
 */
object DraftCleanup {
    /** Ids borrados (para cancelar sus notificaciones). Sin dueno activo no borra nada. Lanza si el Keystore esta ocupado (A1). */
    fun clearPending(drafts: DraftRepository, activeOwner: String?): List<String> {
        if (activeOwner == null) return emptyList()
        val removed = mutableListOf<String>()
        // El filtro se evalua DENTRO de purge (bajo su cerrojo y sobre la lista vigente): si «Guardar» confirmo uno justo antes, ya no
        // es PENDING y se conserva.
        drafts.purge { d -> (d.status == DraftStatus.PENDING && d.ownerKey == activeOwner).also { if (it) removed += d.id } }
        return removed
    }

    /** Confirmados aun sin enviar del dueno activo: lo que `clearCaptured` se llevaria sin enviar (para avisar antes de borrar). */
    fun unsentConfirmed(drafts: List<Draft>, activeOwner: String?): Int =
        OwnerFilter.visible(drafts, activeOwner).count { it.status == DraftStatus.CONFIRMED && !it.syncRejected }

    /**
     * `clearPending` del plugin: [clearPending] bajo el MISMO cerrojo que el envio (no se cruza con un envio que lee o reescribe la
     * cola), cancela la notificacion SOLO de los borrados y avisa el cambio si borro algo. Devuelve cuantos borro. Si el Keystore
     * falla de forma pasajera lanza sin haber borrado ni cancelado nada (A1): el plugin responde STORE_UNAVAILABLE.
     */
    fun clearPendingNow(syncer: ExpenseSyncer, drafts: DraftRepository, activeOwner: String?, notifier: DraftNotifier, changed: () -> Unit = DraftEvents::changed): Int {
        val removed = syncer.coordinated { clearPending(drafts, activeOwner) }
        removed.forEach(notifier::cancel)
        if (removed.isNotEmpty()) changed()
        return removed.size
    }

    /**
     * «Borrar lo capturado» de Seguridad: borrado TOTAL de la cola (de todos los duenos, tambien lo confirmado sin enviar), por
     * privacidad. Bajo el cerrojo del envio para que lo contado sea exactamente lo que se borra. Devuelve cuantos confirmados sin
     * enviar del dueno activo se perdieron. Si el Keystore no deja leer la cola (fallo pasajero) se borra igual y la cuenta sale 0.
     */
    fun clearAllNow(syncer: ExpenseSyncer, drafts: DraftRepository, activeOwner: String?, notifier: DraftNotifier): Int = syncer.coordinated {
        val all = drafts.list()
        val unsent = unsentConfirmed(all, activeOwner)
        all.forEach { notifier.cancel(it.id) }
        drafts.clear()
        unsent
    }
}
