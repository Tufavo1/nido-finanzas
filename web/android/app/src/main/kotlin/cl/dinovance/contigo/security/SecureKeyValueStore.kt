// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.security

import java.io.File
import java.security.MessageDigest

/**
 * Almacén clave-valor cifrado para la sesión de Supabase (DEC-03). Cada valor va en su propio archivo,
 * nombrado con el resumen de la clave, cifrado con [cipher] (Keystore). Nada de esto sale en copias de seguridad.
 */
class SecureKeyValueStore(
    private val directory: File,
    private val cipher: BlobCipher,
    /** Donde se escribe cada bloque cifrado; en produccion AtomicFile (las pruebas JVM usan un archivo simple). */
    private val storageOf: (File) -> BlobStorage = ::AtomicFileStorage,
) {
    /**
     * null si no hay valor. Keystore invalidado (cambio de bloqueo, restauracion) o archivo dañado: ilegible para siempre, se aparta
     * en cuarentena (.bad) y se responde «no hay valor»: la app pide iniciar sesion de nuevo en vez de fallar en bucle (H-16).
     * Un fallo PASAJERO (Keystore ocupado) se propaga sin tocar el archivo: no se pierde la sesion ni la cola (A1).
     */
    fun get(key: String): String? {
        val storage = storageFor(key)
        val bytes = storage.read() ?: return null
        return try {
            String(cipher.decrypt(bytes), Charsets.UTF_8)
        } catch (e: Exception) {
            if (!UnreadableData.isPermanent(e)) throw e
            storage.quarantine()
            null
        }
    }

    fun set(key: String, value: String) {
        storageFor(key).write(cipher.encrypt(value.toByteArray(Charsets.UTF_8)))
    }

    /** Como [set] pero nunca lanza (Keystore roto, disco lleno): false si no quedo guardado. Nada del valor sale en la excepcion. */
    fun trySet(key: String, value: String): Boolean = try {
        set(key, value)
        true
    } catch (e: Exception) {
        false
    }

    fun remove(key: String) = storageFor(key).delete()

    /**
     * Borra todas las claves con ese prefijo (p. ej. «queue-»: colas de hogares anteriores). El nombre del archivo
     * lleva una etiqueta con lo que hay antes del primer «-»; no toca las demás claves, así que no borra la sesión nueva.
     */
    fun removeByPrefix(prefix: String) {
        val tag = tagOf(prefix)
        if (tag.isEmpty()) return
        directory.listFiles()?.filter { it.name.startsWith("$tag.") }?.forEach { it.delete() }
    }

    /** Cierre de sesión: borra todo lo guardado. */
    fun clear() {
        directory.listFiles()?.forEach { it.delete() }
    }

    private fun storageFor(key: String): BlobStorage {
        directory.mkdirs()
        val name = MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        val tag = if (key.contains('-')) tagOf(key) else ""
        return storageOf(File(directory, if (tag.isEmpty()) "$name.bin" else "$tag.$name.bin"))
    }

    private fun tagOf(key: String): String = key.substringBefore('-', "").lowercase().filter { it in 'a'..'z' || it in '0'..'9' }.take(16)
}
