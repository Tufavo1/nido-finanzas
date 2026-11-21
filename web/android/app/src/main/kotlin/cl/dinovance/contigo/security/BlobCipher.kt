// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.security

/** Cifrado de bloques de bytes. La implementación real usa Android Keystore; las pruebas, una falsa. */
interface BlobCipher {
    fun encrypt(plain: ByteArray): ByteArray

    /** Lanza [java.security.GeneralSecurityException] si el bloque fue alterado o la clave ya no existe. */
    fun decrypt(blob: ByteArray): ByteArray
}
