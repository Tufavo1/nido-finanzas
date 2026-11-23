// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.security

import android.util.AtomicFile
import java.io.File
import java.io.IOException

/** Donde se guardan los bloques ya cifrados. */
interface BlobStorage {
    fun read(): ByteArray?

    fun write(bytes: ByteArray)

    fun delete()
}

/** Archivo con escritura atómica: un corte de luz a medio guardar no deja el archivo a medias. */
class AtomicFileStorage(file: File) : BlobStorage {
    private val atomic = AtomicFile(file)

    override fun read(): ByteArray? = try {
        atomic.readFully()
    } catch (e: java.io.FileNotFoundException) {
        null
    }

    override fun write(bytes: ByteArray) {
        val out = atomic.startWrite()
        try {
            out.write(bytes)
            atomic.finishWrite(out)
        } catch (e: IOException) {
            atomic.failWrite(out)
            throw e
        }
    }

    override fun delete() = atomic.delete()
}
