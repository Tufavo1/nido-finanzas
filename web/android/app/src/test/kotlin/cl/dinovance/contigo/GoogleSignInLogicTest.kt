// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.auth.GoogleSignInLogic
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class GoogleSignInLogicTest {
    @Test
    fun `el hash del nonce es SHA-256 hexadecimal conocido`() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", GoogleSignInLogic.hashNonce("abc"))
    }

    @Test
    fun `solo se aceptan nonces seguros y clientes con forma de Google`() {
        assertTrue(GoogleSignInLogic.isValidNonce("abcDEF123_-abcDEF123_-abcDEF123_-"))
        assertFalse(GoogleSignInLogic.isValidNonce(null))
        assertFalse(GoogleSignInLogic.isValidNonce("corto"))
        assertFalse(GoogleSignInLogic.isValidNonce("con espacios y simbolos!!!!!!!!!!"))
        assertFalse(GoogleSignInLogic.isValidNonce("a".repeat(129)))
        assertTrue(GoogleSignInLogic.isValidClientId("305556491325-k77oi3118v74tmfogrnafln4frq40mqp.apps.googleusercontent.com"))
        assertFalse(GoogleSignInLogic.isValidClientId("https://evil.test"))
        assertFalse(GoogleSignInLogic.isValidClientId(null))
    }

    // Dobles con el mismo nombre de clase que los de androidx.credentials (el mapeo mira la clase, nunca el mensaje)
    @Test
    fun `los errores de Credential Manager se mapean a codigos tipados y no filtran el mensaje`() {
        class GetCredentialCancellationException : Exception("correo@x.cl")
        class NoCredentialException : Exception("eyJ.token")
        class GetCredentialInterruptedException : Exception()
        class GetCredentialProviderConfigurationException : Exception()
        assertEquals("CANCELLED", GoogleSignInLogic.errorCode(GetCredentialCancellationException()))
        assertEquals("NO_ACCOUNTS", GoogleSignInLogic.errorCode(NoCredentialException()))
        assertEquals("NETWORK", GoogleSignInLogic.errorCode(GetCredentialInterruptedException()))
        assertEquals("NETWORK", GoogleSignInLogic.errorCode(java.net.UnknownHostException()))
        assertEquals("UNSUPPORTED", GoogleSignInLogic.errorCode(GetCredentialProviderConfigurationException()))
        assertEquals("FAILED", GoogleSignInLogic.errorCode(IllegalStateException("x")))
    }

    @Test
    fun `R8 conserva las clases de Credential Manager y googleid, y el plugin no registra tokens`() {
        val rules = File("proguard-rules.pro").readText()
        assertTrue(rules.contains("androidx.credentials") && rules.contains("com.google.android.libraries.identity.googleid"))
        val plugin = File("src/main/kotlin/cl/dinovance/contigo/plugin/ContigoNativePlugin.kt").readText()
        val google = plugin.substringAfter("fun googleSignIn(").substringBefore("// ---- Diagnóstico")
        assertFalse(Regex("""Log\.|println\(|printStackTrace""").containsMatchIn(google))
        assertTrue(google.contains("hashNonce") && google.contains("setNonce"))
    }
}
