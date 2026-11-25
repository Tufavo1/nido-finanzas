// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.SafeTextStore
import cl.dinovance.contigo.capture.SensitivePrefs
import cl.dinovance.contigo.security.BlobCipher
import cl.dinovance.contigo.security.SecureKeyValueStore
import cl.dinovance.contigo.sync.ExpenseSyncer
import cl.dinovance.contigo.sync.HttpResult
import cl.dinovance.contigo.sync.HttpTransport
import cl.dinovance.contigo.sync.SessionSource
import cl.dinovance.contigo.sync.SyncResult
import cl.dinovance.contigo.sync.SyncStatusStore
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.nio.file.Files

/** Arreglos de la auditoria nativa (A1, M1, M4, B2, B3, B4, B8). Datos SINTETICOS. */
class AuditoriaNativaTest {
    private var now = 1_795_273_230_000L
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private val bank = "cl.demo.banco"

    /** Cifrado real que se puede «romper» de forma transitoria (ProviderException del Keystore ocupado). */
    private class FlakyCipher(private val inner: BlobCipher = JvmAesCipher()) : BlobCipher {
        var broken = false
        override fun encrypt(plain: ByteArray) = if (broken) throw java.security.ProviderException("keystore ocupado") else inner.encrypt(plain)
        override fun decrypt(blob: ByteArray) = if (broken) throw java.security.ProviderException("keystore ocupado") else inner.decrypt(blob)
    }

    private fun draft(id: String, merchant: String? = "Cafe", status: DraftStatus = DraftStatus.PENDING) =
        Draft(id, ParsedCandidate(1_000, merchant, Kind.EXPENSE, Confidence.HIGH, null, "fp-$id"), now, now, status, bank, owner)

    // ---- A1: borradores

    @Test
    fun `A1 un fallo transitorio al descifrar los borradores no borra nada y no se pisa al agregar`() {
        val storage = MemoryStorage()
        val cipher = FlakyCipher()
        val failures = mutableListOf<String>()
        val repo = EncryptedDraftRepository(storage, cipher, onFailure = { failures += it }) { now }
        assertTrue(repo.add(draft("a")))
        val before = storage.bytes!!.copyOf()
        cipher.broken = true
        assertTrue(repo.list().isEmpty())
        assertArrayEquals("el archivo de borradores no se toca ante un fallo transitorio", before, storage.bytes)
        try {
            repo.add(draft("b"))
            fail("agregar con el Keystore ocupado debe fallar, no pisar la cola con un solo borrador")
        } catch (e: RuntimeException) {
            // esperado
        }
        assertArrayEquals(before, storage.bytes)
        assertTrue(failures.contains("ProviderException"))
        cipher.broken = false
        assertEquals(listOf("a"), repo.list().map { it.id })
    }

    @Test
    fun `A1 borradores ilegibles para siempre (otra clave) se apartan en cuarentena en vez de borrarse`() {
        val storage = MemoryStorage()
        EncryptedDraftRepository(storage, JvmAesCipher()) { now }.add(draft("a"))
        val old = storage.bytes!!.copyOf()
        val repo = EncryptedDraftRepository(storage, JvmAesCipher()) { now } // clave perdida: AEADBadTagException
        assertTrue(repo.list().isEmpty())
        assertNull(storage.bytes)
        assertArrayEquals(old, storage.quarantined)
        assertTrue(repo.add(draft("b"))) // y se puede seguir capturando
    }

    // ---- A1: almacen seguro

    @Test
    fun `A1 SecureKeyValueStore no borra la sesion ante un fallo transitorio y lo informa`() {
        val dir: File = Files.createTempDirectory("auditoria-kv").toFile()
        val cipher = FlakyCipher()
        val kv = SecureKeyValueStore(dir, cipher) { FileStorage(it) }
        kv.set("contigo-auth", "sesion")
        cipher.broken = true
        try {
            kv.get("contigo-auth")
            fail("un fallo transitorio debe informarse, no responder «no hay sesion»")
        } catch (e: RuntimeException) {
            // esperado
        }
        cipher.broken = false
        assertEquals("sesion", kv.get("contigo-auth"))
        dir.deleteRecursively()
    }

    @Test
    fun `A1 SecureKeyValueStore aparta en cuarentena un valor ilegible para siempre y remove la limpia`() {
        val dir: File = Files.createTempDirectory("auditoria-kv2").toFile()
        SecureKeyValueStore(dir, JvmAesCipher()) { FileStorage(it) }.set("queue-h1", "[1]")
        val lost = SecureKeyValueStore(dir, JvmAesCipher()) { FileStorage(it) }
        assertNull(lost.get("queue-h1"))
        val names = dir.list()!!.toList()
        assertTrue("debe quedar solo la copia .bad: $names", names.size == 1 && names.single().endsWith(".bad"))
        lost.remove("queue-h1")
        assertTrue(dir.list()!!.isEmpty())
        dir.deleteRecursively()
    }

    // ---- B3: preferencias cifradas

    @Test
    fun `B3 una lectura fallida de las preferencias no se cachea como vacia ni pisa la configuracion real`() {
        var value: String? = null
        var failNext = false
        val store = SafeTextStore({ if (failNext) { failNext = false; throw java.security.ProviderException("ocupado") } else value }, { value = it })
        SensitivePrefs(store).apply { setWhitelist(setOf(bank)); setMaxClp(80_000) }
        failNext = true
        val p = SensitivePrefs(store)
        assertTrue(p.whitelist().isEmpty()) // la lectura fallo: por ahora no hay lista
        p.setBankAutoSave("santander", true)
        val again = SensitivePrefs(store)
        assertEquals(setOf(bank), again.whitelist())
        assertEquals(80_000L, again.maxClp())
        assertTrue(again.bankAutoSave("santander"))
    }

    // ---- M1 y B2: captura

    private val cfg = object : AutoConfig {
        // Migrado (2026-11-24): banco sintetico VERIFICADO; Santander ya no se captura (BankPresets.VERIFIED)
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "banco-falabella" else null
        override fun autoEnabled(bank: String) = true
        override fun maxClp() = 50_000L
    }
    private val profile = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Cafe Demo Norte") to cat))
    private fun processor(repo: DraftRepository) = CaptureProcessor(
        { setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile },
    )

    @Test
    fun `M1 un aviso con monto ambiguo nunca se guarda solo, queda pendiente`() {
        val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
        assertEquals(Outcome.STORED, processor(repo).process(bank, null, "Compra por \$4.900 en Cafe Demo Norte, comision \$9.900", now))
        val d = repo.list().single()
        assertEquals(DraftStatus.PENDING, d.status)
        assertFalse(d.autoSaved)
    }

    @Test
    fun `M1 control el mismo comercio sin monto ambiguo si se guarda solo`() {
        val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
        processor(repo).process(bank, null, "Compra por \$4.900 en Cafe Demo Norte", now)
        assertEquals(DraftStatus.CONFIRMED, repo.list().single().status)
    }

    @Test
    fun `B2 el detalle que llega despues no reescribe un borrador que la persona ya confirmo`() {
        val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
        val p = processor(repo)
        assertEquals(Outcome.STORED, p.process(bank, null, "Compra por \$4.800", now)) // sin comercio: pendiente
        val id = repo.list().single().id
        repo.setStatus(id, DraftStatus.CONFIRMED) // la persona lo guardo
        now += 5_000
        assertEquals(Outcome.DUPLICATE, p.process(bank, null, "Compra por \$4.800 en Cafe Demo Norte", now))
        val d = repo.list().single()
        assertEquals(DraftStatus.CONFIRMED, d.status)
        assertNull("no se cambia lo que la persona ya confirmo", d.candidate.merchant)
    }

    @Test
    fun `B2 control el detalle si completa un borrador que sigue pendiente`() {
        val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
        val p = processor(repo)
        p.process(bank, null, "Compra por \$4.800", now)
        now += 5_000
        assertEquals(Outcome.DUPLICATE, p.process(bank, null, "Compra por \$4.800 en Cafe Demo Norte", now))
        assertEquals("Cafe Demo Norte", repo.list().single().candidate.merchant)
    }

    // ---- M4: columna nueva sin migrar en el servidor

    private class Sess : SessionSource { override fun accessToken(nowSeconds: Long) = "tok"; override fun refresh() = false }
    private class St : SyncStatusStore {
        val errors = mutableListOf<String>()
        override fun recordSuccess(nowMillis: Long) {}
        override fun recordError(kind: String, nowMillis: Long) { errors += kind }
    }
    private class Net(var reply: (String) -> HttpResult) : HttpTransport {
        override fun post(url: String, headers: Map<String, String>, body: String) = reply(url)
    }

    @Test
    fun `M4 un 400 por columna desconocida (migracion sin aplicar) se reintenta y no queda rechazado`() {
        val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
        val id = "55555555-5555-4555-8555-555555555555"
        repo.add(Draft(id, ParsedCandidate(10_399, "Cafe Demo Norte", Kind.EXPENSE, Confidence.HIGH, null, "fp", "CMR Mastercard ·5766"), now, now, DraftStatus.CONFIRMED, bank, owner, categoryId = cat))
        val schema = HttpResult(400, "{\"code\":\"PGRST204\",\"details\":null,\"hint\":null,\"message\":\"Could not find the 'payment_method' column of 'expenses' in the schema cache\"}")
        val net = Net { schema }
        val st = St()
        val syncer = ExpenseSyncer(repo, { profile }, { owner }, { "https://api.demo.test/supabase" }, Sess(), net, st, { now })
        assertEquals(SyncResult.RETRY, syncer.syncOnce())
        assertFalse(repo.list().single().syncRejected)
        net.reply = { HttpResult(201, "") }
        assertEquals(SyncResult.ALL_SENT, syncer.syncOnce())
        assertTrue(repo.list().isEmpty())
    }

    @Test
    fun `M4 control un 400 por dato invalido sigue quedando rechazado`() {
        val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
        repo.add(Draft("55555555-5555-4555-8555-555555555556", ParsedCandidate(1_000, "Cafe Demo Norte", Kind.EXPENSE, Confidence.HIGH, null, "fp"), now, now, DraftStatus.CONFIRMED, bank, owner, categoryId = cat))
        val syncer = ExpenseSyncer(repo, { profile }, { owner }, { "https://api.demo.test/supabase" }, Sess(), Net { HttpResult(400, "{\"code\":\"23514\",\"message\":\"check\"}") }, St(), { now })
        assertEquals(SyncResult.REJECTED, syncer.syncOnce())
        assertTrue(repo.list().single().syncRejected)
    }

    // ---- B4 y B8: codigo Android (no corre en la JVM), se revisa el fuente

    private fun src(path: String) = File("src/main/kotlin/cl/dinovance/contigo/$path").readText()

    @Test
    fun `B8 removeDraft pasa por el mismo cerrojo que el envio`() {
        val body = src("plugin/ContigoNativePlugin.kt").substringAfter("fun removeDraft(").substringBefore("@PluginMethod")
        assertTrue(body.contains("syncer.coordinated"))
    }

    @Test
    fun `A1 secureGet no tumba la app si el almacen falla de forma transitoria`() {
        val body = src("plugin/ContigoNativePlugin.kt").substringAfter("fun secureGet(").substringBefore("@PluginMethod")
        assertTrue(body.contains("catch"))
    }

    @Test
    fun `B4 la generacion de la clave del Keystore va bajo un cerrojo por alias`() {
        val s = src("security/KeystoreAesGcm.kt")
        assertTrue(s.contains("synchronized(lockFor(alias))"))
        assertNotNull(Regex("fun key\\(\\)[\\s\\S]*synchronized").find(s))
    }
}
