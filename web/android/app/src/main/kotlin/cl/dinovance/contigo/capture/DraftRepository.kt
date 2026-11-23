// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import cl.dinovance.contigo.security.BlobCipher
import cl.dinovance.contigo.security.BlobStorage
import org.json.JSONArray
import org.json.JSONException
import java.security.GeneralSecurityException

interface DraftRepository {
    fun list(): List<Draft>

    /** false si la cola está llena (no se pierde lo anterior, se descarta lo nuevo). */
    fun add(draft: Draft): Boolean

    fun setStatus(id: String, status: DraftStatus): Boolean

    /** Cambia un borrador existente; false si ya no está. */
    fun update(id: String, change: (Draft) -> Draft): Boolean

    fun remove(id: String)

    /** Borra los que cumplen [predicate] y devuelve cuántos. */
    fun purge(predicate: (Draft) -> Boolean): Int

    fun clear()
}

/**
 * Cola local de borradores, cifrada con [cipher] (Keystore). El archivo en disco no contiene el monto ni
 * ningún texto en claro (CA-05-1). Un borrador SIN confirmar por más de 7 días se elimina (CA-05-3); uno confirmado con «Guardar» nunca caduca: solo sale al enviarse (H-05).
 */
class EncryptedDraftRepository(
    private val storage: BlobStorage,
    private val cipher: BlobCipher,
    private val clock: () -> Long,
) : DraftRepository {
    // Todas las operaciones son leer-modificar-escribir sobre el mismo archivo: el servicio y el hilo del plugin
    // compiten, así que van serializadas (H-07). La instancia es única (CaptureGraph).
    @Synchronized
    override fun list(): List<Draft> = load().filter { it.status == DraftStatus.CONFIRMED || clock() - it.createdAtMillis < MAX_AGE_MILLIS }

    @Synchronized
    override fun add(draft: Draft): Boolean {
        val current = list()
        if (current.size >= MAX_DRAFTS) return false
        save(current + draft)
        return true
    }

    @Synchronized
    override fun setStatus(id: String, status: DraftStatus): Boolean = update(id) { it.copy(status = status) }

    @Synchronized
    override fun update(id: String, change: (Draft) -> Draft): Boolean {
        val current = list()
        if (current.none { it.id == id }) return false
        save(current.map { if (it.id == id) change(it) else it })
        return true
    }

    @Synchronized
    override fun remove(id: String) = save(list().filterNot { it.id == id })

    @Synchronized
    override fun purge(predicate: (Draft) -> Boolean): Int {
        val current = list()
        val kept = current.filterNot(predicate)
        if (kept.size != current.size) save(kept)
        return current.size - kept.size
    }

    @Synchronized
    override fun clear() = storage.delete()

    private fun load(): List<Draft> {
        val bytes = storage.read() ?: return emptyList()
        return try {
            val array = JSONArray(String(cipher.decrypt(bytes), Charsets.UTF_8))
            // Un borrador ilegible (p. ej. un tipo que esta version no conoce) se salta sin perder los demas
            (0 until array.length()).mapNotNull { i -> try { Draft.fromJson(array.getJSONObject(i)) } catch (e: JSONException) { null } catch (e: IllegalArgumentException) { null } }
        } catch (e: GeneralSecurityException) {
            discardUnreadable()
        } catch (e: JSONException) {
            discardUnreadable()
        } catch (e: RuntimeException) {
            // ProviderException del Keystore u otro fallo al descifrar: como una clave perdida, no debe tumbar la captura
            discardUnreadable()
        }
    }

    // Clave perdida o archivo dañado: no hay forma de recuperarlo, así que se vacía en vez de fallar siempre.
    private fun discardUnreadable(): List<Draft> {
        storage.delete()
        return emptyList()
    }

    private fun save(drafts: List<Draft>) {
        val array = JSONArray()
        drafts.forEach { array.put(it.toJson()) }
        storage.write(cipher.encrypt(array.toString().toByteArray(Charsets.UTF_8)))
    }

    companion object {
        const val MAX_DRAFTS = 50
        const val MAX_AGE_MILLIS = 7L * 24 * 60 * 60 * 1000
    }
}
