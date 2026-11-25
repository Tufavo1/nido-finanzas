// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

/** Un borrador solo es visible, y solo se envía, para el usuario/hogar que estaba activo al capturarlo (H-06). */
object OwnerFilter {
    fun visible(drafts: List<Draft>, activeOwner: String?): List<Draft> =
        if (activeOwner == null) emptyList() else drafts.filter { it.ownerKey == activeOwner }

    /** Los de otro dueño o sin dueño se descartan al cambiar de sesion: no deben sobrevivir al otro usuario. */
    fun foreign(drafts: List<Draft>, activeOwner: String?): List<Draft> = drafts.filter { it.ownerKey != activeOwner || activeOwner == null }

    /** El borrador es del dueno activo. Uno sin dueno (capturado sin sesion) no es de nadie hasta que se adopta (R2-03). */
    fun owns(draft: Draft, activeOwner: String?): Boolean = activeOwner != null && draft.ownerKey == activeOwner

    /** Id que se entrega a la app al abrir desde la notificacion: solo si es de un borrador del dueno activo; si no, null. */
    fun openable(drafts: List<Draft>, activeOwner: String?, id: String?): String? = id?.takeIf { i -> drafts.any { it.id == i && owns(it, activeOwner) } }

    /** Usuario de una clave `usuario:hogar`. */
    fun userOf(ownerKey: String): String = ownerKey.substringBefore(':')

    /**
     * Borradores capturados SIN sesion (sin dueno) que se asignan al volver a iniciar sesion la MISMA persona. Si entra otra
     * persona no se asignan (se borran con el cambio de cuenta): no deben filtrarse a otro usuario (R2-03).
     */
    fun adoptable(drafts: List<Draft>, newOwner: String, lastUser: String?): List<Draft> =
        if (lastUser != null && userOf(newOwner) == lastUser) drafts.filter { it.ownerKey == null } else emptyList()
}
