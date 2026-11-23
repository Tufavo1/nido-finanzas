// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.GeneralSecurityException
import java.security.InvalidKeyException
import java.security.UnrecoverableKeyException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-256-GCM con una clave que vive dentro de Android Keystore y no se puede exportar: no hay ninguna clave
 * en el código ni en el APK. Formato del bloque: [versión 1 byte][IV 12 bytes][texto cifrado + etiqueta].
 */
class KeystoreAesGcm(private val alias: String) : BlobCipher {
    override fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        try {
            cipher.init(Cipher.ENCRYPT_MODE, key())
        } catch (e: InvalidKeyException) {
            // Clave invalidada para siempre (KeyPermanentlyInvalidatedException) o dañada: se reemplaza por una nueva para poder seguir
            // guardando. Lo cifrado con la anterior ya era ilegible y se descarta al leerlo (pide iniciar sesion de nuevo, sin fallar).
            cipher.init(Cipher.ENCRYPT_MODE, replaceKey())
        } catch (e: UnrecoverableKeyException) {
            cipher.init(Cipher.ENCRYPT_MODE, replaceKey())
        }
        return byteArrayOf(FORMAT_VERSION) + cipher.iv + cipher.doFinal(plain)
    }

    private fun replaceKey(): SecretKey {
        KeyStore.getInstance(PROVIDER).apply { load(null) }.deleteEntry(alias)
        return generate()
    }

    override fun decrypt(blob: ByteArray): ByteArray {
        if (blob.size <= HEADER_SIZE || blob[0] != FORMAT_VERSION) throw GeneralSecurityException("bloque no reconocido")
        val iv = blob.copyOfRange(1, HEADER_SIZE)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
        return cipher.doFinal(blob, HEADER_SIZE, blob.size - HEADER_SIZE)
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(PROVIDER).apply { load(null) }
        return (store.getKey(alias, null) as? SecretKey) ?: generate()
    }

    private fun generate(): SecretKey {
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(KEY_BITS)
            .setRandomizedEncryptionRequired(true)
            .build()
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        generator.init(spec)
        return generator.generateKey()
    }

    private companion object {
        const val PROVIDER = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val FORMAT_VERSION: Byte = 1
        const val IV_SIZE = 12
        const val HEADER_SIZE = 1 + IV_SIZE
        const val TAG_BITS = 128
        const val KEY_BITS = 256
    }
}
