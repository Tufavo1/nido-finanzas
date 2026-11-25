// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.security

/** Cifrado de bloques de bytes. La implementación real usa Android Keystore; las pruebas, una falsa. */
interface BlobCipher {
    fun encrypt(plain: ByteArray): ByteArray

    /** Lanza [java.security.GeneralSecurityException] si el bloque fue alterado o la clave ya no existe. */
    fun decrypt(blob: ByteArray): ByteArray
}

/** El bloque no tiene el formato propio (archivo dañado o de otra version): ilegible para siempre. */
class UnreadableBlobException(message: String) : java.security.GeneralSecurityException(message)

/**
 * ¿El fallo al leer un bloque cifrado es PERMANENTE (clave perdida o datos dañados)? Solo entonces se aparta el archivo.
 * Cualquier otro fallo (ProviderException del Keystore ocupado, KeyStoreException, falta de memoria...) es transitorio: no se
 * toca lo guardado (A1). Las clases de Android se comparan por nombre para que esto corra tambien en la JVM de las pruebas.
 */
object UnreadableData {
    fun isPermanent(e: Throwable): Boolean = when (e) {
        is UnreadableBlobException, is javax.crypto.BadPaddingException, // AEADBadTagException: otra clave o bloque alterado
        is java.security.UnrecoverableKeyException, is org.json.JSONException -> true
        // KeyPermanentlyInvalidatedException y otras claves dañadas; NO UserNotAuthenticatedException (falta desbloquear, es pasajero).
        // KeystoreAesGcm.encrypt ya reemplaza la clave ante InvalidKeyException: lo cifrado con la anterior no se puede recuperar.
        is java.security.InvalidKeyException -> e.javaClass.name != "android.security.keystore.UserNotAuthenticatedException"
        else -> false
    }
}
