// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

/**
 * Lista cifrada con leer-modificar-escribir SEGURO (R7). Antes, `add` leia con [TextStore.read] (que ante un fallo PASAJERO del
 * Keystore responde «no hay valor») y luego escribia la lista nueva encima: un Keystore ocupado borraba el historial y, en el
 * registro anti-duplicados, permitia guardar dos veces el mismo aviso (plata real).
 *
 * Politica:
 * - Todo cambio entra a una cola en memoria y se intenta escribir de inmediato: se lee con [TextStore.readChecked] (1 reintento) y
 *   se escribe con [TextStore.writeChecked]. Si la lectura falla las dos veces, NO se escribe nada: el archivo queda intacto.
 * - El cambio queda en la cola (tope [maxPending]; si se llena se descarta el MAS VIEJO) y se aplica en la siguiente escritura que
 *   logre leer. Mientras tanto [view] ya lo muestra (el registro anti-duplicados sigue deduplicando en este proceso). Si el
 *   proceso muere antes, ese cambio se pierde: es lo unico que se pierde, nunca lo ya guardado.
 * - Un bloque ilegible PARA SIEMPRE (clave perdida, bloque alterado) ya lo aparta [cl.dinovance.contigo.security.SecureKeyValueStore]
 *   en cuarentena `.bad` y llega como «no hay valor»; un JSON dañado dentro de un bloque valido tambien se toma como vacio.
 * - [onFailure] recibe SOLO el nombre de la clase de la excepcion (o [DROPPED]): jamas texto, montos ni claves.
 * - Los cambios ([update]) deben ser idempotentes: si la escritura falla se vuelven a aplicar sobre lo que se lea despues.
 *
 * No es seguro entre hilos por si sola: el dueño la usa dentro de sus metodos `@Synchronized`.
 */
class CheckedJsonList<E>(
    private val store: TextStore,
    /** Lanza si el JSON esta dañado. */
    private val parse: (String) -> List<E>,
    private val encode: (List<E>) -> String,
    private val maxPending: Int,
    private val onFailure: (String) -> Unit,
) {
    private val pending = ArrayDeque<(List<E>) -> List<E>>()

    /** Cambios aun no escritos (para pruebas y diagnostico). */
    val pendingCount: Int get() = pending.size

    /** Lo guardado con los cambios aun no escritos encima. Un fallo pasajero de lectura muestra solo lo de la cola (no escribe nada). */
    fun view(): List<E> {
        val base = try {
            readWithRetry()
        } catch (e: Exception) {
            onFailure(e.javaClass.simpleName)
            emptyList()
        }
        return applyPending(base)
    }

    /** Encola [change] e intenta escribir. false = quedo en memoria (se reintenta en el siguiente cambio). */
    fun update(change: (List<E>) -> List<E>): Boolean {
        if (pending.size >= maxPending) {
            pending.removeFirst()
            onFailure(DROPPED)
        }
        pending.addLast(change)
        return flush()
    }

    /** Escribe la cola sobre lo leido de verdad. No escribe si la lectura falla. */
    fun flush(): Boolean {
        if (pending.isEmpty()) return true
        val base = try {
            readWithRetry()
        } catch (e: Exception) {
            onFailure(e.javaClass.simpleName)
            return false
        }
        return try {
            store.writeChecked(encode(applyPending(base)))
            pending.clear()
            true
        } catch (e: Exception) {
            onFailure(e.javaClass.simpleName)
            false
        }
    }

    /** Olvida los cambios aun no escritos (tras un «borrar todos» que ya se escribio). */
    fun discardPending() = pending.clear()

    /** Cierre de sesion / borrar todo: se van lo guardado y la cola. */
    fun clear() {
        pending.clear()
        store.write(null)
    }

    private fun applyPending(base: List<E>): List<E> = pending.fold(base) { acc, change -> change(acc) }

    /** Lanza si el Keystore falla dos veces seguidas (pasajero). JSON dañado = vacio (no hay como recuperarlo). */
    private fun readWithRetry(): List<E> {
        val raw = try {
            store.readChecked()
        } catch (first: Exception) {
            store.readChecked()
        } ?: return emptyList()
        return try {
            parse(raw)
        } catch (e: Exception) {
            emptyList()
        }
    }

    companion object {
        /** Se lleno la cola en memoria y se descarto el cambio mas viejo. */
        const val DROPPED = "PendingDropped"
    }
}
