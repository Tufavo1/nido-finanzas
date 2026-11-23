// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.auth

import java.security.MessageDigest

/** Reglas puras de «Entrar con Google» (sin Android, para probarlas en JVM). */
object GoogleSignInLogic {
    private val NONCE = Regex("[A-Za-z0-9_-]{16,128}")
    private val CLIENT_ID = Regex("[0-9]{6,20}-[a-z0-9]{8,64}\\.apps\\.googleusercontent\\.com")

    fun isValidNonce(nonce: String?): Boolean = nonce != null && NONCE.matches(nonce)

    /** ID de cliente WEB con la forma de Google (no es secreto): evita mandar al selector algo inventado. */
    fun isValidClientId(id: String?): Boolean = id != null && CLIENT_ID.matches(id)

    /** SHA-256 en hexadecimal minusculas: lo que va en el token como claim `nonce`; Supabase recibe el nonce en claro. */
    fun hashNonce(nonce: String): String = MessageDigest.getInstance("SHA-256").digest(nonce.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    /** Codigo tipado para la app a partir de la clase de la excepcion de Credential Manager (jamas su mensaje). */
    fun errorCode(t: Throwable): String {
        val name = t.javaClass.name
        return when {
            name.endsWith("GetCredentialCancellationException") -> "CANCELLED"
            name.endsWith("NoCredentialException") -> "NO_ACCOUNTS"
            name.endsWith("GetCredentialInterruptedException") || t is java.io.IOException -> "NETWORK"
            name.endsWith("GetCredentialProviderConfigurationException") || name.endsWith("GetCredentialUnsupportedException") -> "UNSUPPORTED"
            else -> "FAILED"
        }
    }
}
