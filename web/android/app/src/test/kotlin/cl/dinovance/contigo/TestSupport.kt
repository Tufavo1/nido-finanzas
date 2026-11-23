// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftNotifier
import cl.dinovance.contigo.capture.HealthRecorder
import cl.dinovance.contigo.security.BlobCipher
import cl.dinovance.contigo.security.BlobStorage
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** AES-GCM de la JVM con clave aleatoria de la prueba: mismo formato de uso que Keystore, sin Android. */
class JvmAesCipher : BlobCipher {
    private val key = SecretKeySpec(ByteArray(32).also { SecureRandom().nextBytes(it) }, "AES")

    override fun encrypt(plain: ByteArray): ByteArray {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv)) }
        return iv + c.doFinal(plain)
    }

    override fun decrypt(blob: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, blob.copyOfRange(0, 12))) }
        return c.doFinal(blob, 12, blob.size - 12)
    }
}

class MemoryStorage : BlobStorage {
    var bytes: ByteArray? = null
    override fun read() = bytes
    override fun write(bytes: ByteArray) { this.bytes = bytes }
    override fun delete() { bytes = null }
}

class RecordingNotifier : DraftNotifier {
    val shown = mutableListOf<Draft>()
    val cancelled = mutableListOf<String>()
    override fun show(draft: Draft) { shown += draft }
    override fun cancel(draftId: String) { cancelled += draftId }
    /** Guardados solos; como antes, tambien quedan en [shown] (comportamiento por defecto de DraftNotifier). */
    val autoSaved = mutableListOf<Draft>()
    override fun autoSaved(draft: Draft) { autoSaved += draft; show(draft) }
}

class RecordingHealth : HealthRecorder {
    var events = 0
    val failures = mutableListOf<String>()
    override fun recordEvent(nowMillis: Long) { events++ }
    override fun recordFailure(errorClass: String, nowMillis: Long) { failures += errorClass }
}

/** Archivo simple (AtomicFile de Android no corre en la JVM): para probar SecureKeyValueStore de punta a punta con bytes en disco. */
class FileStorage(private val file: java.io.File) : BlobStorage {
    override fun read(): ByteArray? = if (file.exists()) file.readBytes() else null
    override fun write(bytes: ByteArray) { file.parentFile?.mkdirs(); file.writeBytes(bytes) }
    override fun delete() { file.delete() }
}
