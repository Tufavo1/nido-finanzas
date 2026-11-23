// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoSavedEntry
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.LegacyPrefs
import cl.dinovance.contigo.capture.MigrationResult
import cl.dinovance.contigo.capture.OwnerFilter
import cl.dinovance.contigo.capture.RecentApps
import cl.dinovance.contigo.capture.SafeTextStore
import cl.dinovance.contigo.capture.SeenNotices
import cl.dinovance.contigo.capture.SensitivePrefs
import cl.dinovance.contigo.security.BlobCipher
import cl.dinovance.contigo.security.SecureKeyValueStore
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.GeneralSecurityException

/** Ronda 5, cifrado en reposo: lo que revela habitos o dinero (bancos, apps, tope, dueno) pasa de SharedPreferences en claro a Keystore. */
class CifradoRonda5Test {
    private val dir: File = Files.createTempDirectory("contigo-r5").toFile().also { it.deleteOnExit() }
    private val cipher = JvmAesCipher()
    private val failures = mutableListOf<String>()
    private fun store(c: BlobCipher = cipher) = SecureKeyValueStore(dir, c) { FileStorage(it) }
    private fun text(kv: SecureKeyValueStore, key: String = SensitivePrefs.STORE_KEY) = SafeTextStore({ kv.get(key) }, { v -> if (v == null) kv.remove(key) else kv.set(key, v) }) { failures += it }
    private fun prefs(legacy: LegacyPrefs? = null, kv: SecureKeyValueStore = store()) = SensitivePrefs(text(kv), legacy) { failures += it }

    /** Todo lo que quedo escrito en disco (bytes de todos los archivos), para buscar fugas en claro. */
    private fun disk(): String = dir.walkTopDown().filter { it.isFile }.joinToString("|") { String(it.readBytes(), Charsets.ISO_8859_1) }

    private val bank = "cl.banco.demo"

    private fun legacyFull() = FakeLegacy(
        mutableMapOf(
            "whitelist" to setOf(bank, "cl.billetera.demo"),
            "recent_apps" to setOf("$bank|1700000000000", "com.mensajes.demo|1700000001000"),
            "bank_pkg_banco-falabella" to bank,
            "bank_auto_banco-falabella" to true,
            "bank_det_santander" to setOf("cl.santander.demo"),
            "auto_cap" to 80_000L,
            "active_owner" to "u1:h1",
            "last_user" to "u1",
            // no sensibles: se quedan en claro
            "api_base" to "https://worker.demo/supabase",
            "hide_on_lock" to true,
            "failures" to 3,
        ),
    )

    @Test
    fun `migra lo sensible de las preferencias en claro al almacen cifrado y borra la copia en claro`() {
        val legacy = legacyFull()
        val p = prefs(legacy)
        assertEquals(MigrationResult.MIGRATED, p.migrate())
        assertEquals(setOf(bank, "cl.billetera.demo"), p.whitelist())
        assertEquals(mapOf(bank to 1_700_000_000_000L, "com.mensajes.demo" to 1_700_000_001_000L), p.recentApps())
        assertEquals(bank, p.bankPackage("banco-falabella")); assertTrue(p.bankAutoSave("banco-falabella"))
        assertEquals(setOf("cl.santander.demo"), p.detectedPackages("santander"))
        assertEquals(80_000L, p.maxClp()); assertEquals("u1:h1", p.activeOwner()); assertEquals("u1", p.lastUser())
        // La copia en claro ya no existe; lo no sensible sigue
        assertEquals(setOf("api_base", "hide_on_lock", "failures"), legacy.map.keys)
        assertEquals(SensitivePrefs.VERSION, legacy.ver)
        // En disco no queda nada legible
        val raw = disk()
        listOf(bank, "billetera", "mensajes", "santander", "80000", "u1:h1", "falabella").forEach { assertFalse(it, raw.contains(it)) }
    }

    @Test
    fun `la migracion es idempotente y sobrevive a un reinicio`() {
        val legacy = legacyFull()
        assertEquals(MigrationResult.MIGRATED, prefs(legacy).migrate())
        assertEquals(MigrationResult.NOT_NEEDED, prefs(legacy).migrate())
        val again = prefs(legacy) // "reinicio": instancia nueva sobre el mismo disco
        assertEquals(MigrationResult.NOT_NEEDED, again.migrate())
        assertEquals(80_000L, again.maxClp()); assertEquals(setOf(bank, "cl.billetera.demo"), again.whitelist())
    }

    @Test
    fun `si se corta entre escribir cifrado y borrar lo claro, el reintento no pierde ni duplica y gana lo cifrado`() {
        val legacy = legacyFull().apply { failRemove = true }
        val p = prefs(legacy)
        assertEquals(MigrationResult.DEFERRED, p.migrate())
        assertTrue(legacy.map.containsKey("auto_cap")) // no se pudo borrar todavia
        p.setMaxClp(30_000) // la persona cambia el tope despues (queda cifrado)
        legacy.failRemove = false
        val next = prefs(legacy)
        assertEquals(MigrationResult.MIGRATED, next.migrate())
        assertEquals(30_000L, next.maxClp()) // el valor viejo en claro no pisa al nuevo cifrado
        assertEquals(setOf(bank, "cl.billetera.demo"), next.whitelist())
        assertFalse(legacy.map.containsKey("auto_cap"))
    }

    @Test
    fun `con el Keystore roto la migracion se aplaza sin borrar lo claro, sin lanzar, y la app sigue con los valores`() {
        val legacy = legacyFull()
        val p = prefs(legacy, store(BrokenCipher()))
        assertEquals(MigrationResult.DEFERRED, p.migrate())
        assertTrue(legacy.map.containsKey("whitelist")) // sin perder datos
        assertEquals(setOf(bank, "cl.billetera.demo"), p.whitelist()) // y se sigue capturando en esta ejecucion
        p.setWhitelist(setOf(bank)) // escribir tampoco lanza
        assertEquals(setOf(bank), p.whitelist())
        assertTrue(failures.isNotEmpty() && failures.all { it.matches(Regex("[A-Za-z]+")) })
    }

    @Test
    fun `un bloque que ya no se puede descifrar (clave perdida) degrada a valores por defecto sin exponer ni lanzar`() {
        val kv = store()
        val p = prefs(kv = kv)
        p.setWhitelist(setOf(bank)); p.setMaxClp(80_000); p.setBankAutoSave("banco-falabella", true); p.setActiveOwner("u1:h1")
        // Restaurado en otro telefono / clave invalidada: el mismo disco con otra clave
        val lost = prefs(kv = store(JvmAesCipher()))
        assertEquals(emptySet<String>(), lost.whitelist())
        assertNull(lost.maxClp()); assertFalse(lost.bankAutoSave("banco-falabella")) // apagado: nada se guarda solo
        assertNull(lost.activeOwner())
        // El bloque ilegible se borro (no queda basura cifrada con la clave vieja)
        assertTrue(dir.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `un cipher que lanza en todo no tumba borradores, registro, diagnostico ni vistos`() {
        val broken = BrokenCipher()
        val repo = EncryptedDraftRepository(MemoryStorage().apply { bytes = ByteArray(40) { 1 } }, broken) { 1L }
        assertTrue(repo.list().isEmpty())
        val kv = store(broken)
        AutoSavedLog(text(kv, "auto-log")) { 1L }.apply { add(AutoSavedEntry("id", 1_000, "Cafe", 1L, false, "u1:h1")); assertTrue(list().isEmpty()) }
        DiagnosticsLog(text(kv, "diag-log")) { 1L }.apply { add(DiagReason.NO_AMOUNT, null, "Compraste \$1.000 en Cafe"); assertTrue(list().isEmpty()) }
        SeenNotices(text(kv, "seen-notices")).apply { mark(bank, "k", 1L); assertFalse(has(bank, "k", 1L)) }
        assertFalse(kv.trySet("x", "y"))
        // Ninguna excepcion lleva texto del aviso ni montos: solo se registran nombres de clase
        assertTrue(failures.none { it.contains("1.000") || it.contains("Cafe") })
    }

    @Test
    fun `un bloque de borradores con un tipo desconocido no tumba la lista`() {
        val storage = MemoryStorage()
        val c = JvmAesCipher()
        storage.bytes = c.encrypt("[{\"id\":\"x\",\"amountClp\":1,\"kind\":\"OTRO\"}]".toByteArray())
        assertTrue(EncryptedDraftRepository(storage, c) { 1L }.list().isEmpty())
    }

    @Test
    fun `cerrar sesion borra todo lo sensible y cambiar de cuenta borra la configuracion de la persona anterior`() {
        val p = prefs()
        p.setWhitelist(setOf(bank)); p.setRecentApps(mapOf(bank to 1L)); p.setBankPackage("banco-falabella", bank); p.setBankAutoSave("banco-falabella", true)
        p.setDetectedPackages("santander", setOf("cl.santander.demo")); p.setMaxClp(80_000); p.setActiveOwner("u1:h1"); p.setLastUser("u1")
        p.clearAccountConfig()
        assertTrue(p.whitelist().isEmpty() && p.recentApps().isEmpty()); assertNull(p.bankPackage("banco-falabella"))
        assertFalse(p.bankAutoSave("banco-falabella")); assertNull(p.maxClp())
        assertEquals(setOf("cl.santander.demo"), p.detectedPackages("santander")) // apps instaladas: se vuelven a detectar igual
        p.clearAll()
        assertTrue(p.detectedPackages("santander").isEmpty()); assertNull(p.activeOwner()); assertNull(p.lastUser())
        assertFalse(disk().contains("santander"))
        assertTrue(prefs().whitelist().isEmpty()) // tambien tras reiniciar
    }

    @Test
    fun `apps recientes cifradas mantienen el tope y la frecuencia de escritura`() {
        val p = prefs()
        val recent = RecentApps(p.asRecentStore(), max = 3)
        (1..5).forEach { recent.record("com.app$it", it * 100_000L) }
        assertEquals(listOf("com.app5", "com.app4", "com.app3"), recent.list().map { it.first })
        assertEquals(3, prefs().recentApps().size)
        assertFalse(disk().contains("com.app"))
    }

    @Test
    fun `R2-03 un aviso sin dueno se recupera tras reiniciar porque la ultima persona queda cifrada`() {
        prefs().apply { setLastUser("u1"); setActiveOwner(null) }
        val orphan = Draft("d1", ParsedCandidate(1_000, "Cafe", Kind.EXPENSE, Confidence.HIGH, null, "f"), 1L, 1L, DraftStatus.PENDING, bank, null)
        val restarted = prefs()
        assertEquals(listOf(orphan), OwnerFilter.adoptable(listOf(orphan), "u1:h9", restarted.lastUser()))
        assertTrue(OwnerFilter.adoptable(listOf(orphan), "u2:h9", restarted.lastUser()).isEmpty())
    }

    // ---- dobles
    class FakeLegacy(val map: MutableMap<String, Any?>) : LegacyPrefs {
        var ver = 0
        var failRemove = false
        override fun all(): Map<String, Any?> = map.toMap()
        override fun remove(keys: Collection<String>): Boolean {
            if (failRemove) return false
            keys.forEach { map.remove(it) }
            return true
        }
        override fun version() = ver
        override fun setVersion(version: Int) { ver = version }
    }

    /** Keystore invalidado: no cifra ni descifra nada. */
    class BrokenCipher : BlobCipher {
        override fun encrypt(plain: ByteArray): ByteArray = throw GeneralSecurityException("clave invalidada")
        override fun decrypt(blob: ByteArray): ByteArray = throw GeneralSecurityException("clave invalidada")
    }
}
