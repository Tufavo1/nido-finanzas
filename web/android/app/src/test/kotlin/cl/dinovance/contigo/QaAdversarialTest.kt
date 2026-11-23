// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.Outcome
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

/**
 * QA adversarial (datos SINTETICOS). Cada prueba describe un hallazgo de docs/mobile/qa-integracion.md y FALLA hoy
 * por la razon indicada en su mensaje. No son pruebas de «camino feliz».
 */
class QaAdversarialTest {
    private val bank = "cl.demo.banco"
    private val own = "cl.dinovance.contigo"
    private val purchase = "Compra aprobada por $6.500 en CAFE DEMO NORTE."
    private var now = 1_795_273_230_000L
    private var ids = 0
    private val storage = MemoryStorage()
    private val repo: DraftRepository = EncryptedDraftRepository(storage, JvmAesCipher()) { now }
    private val notifier = RecordingNotifier()
    private var whitelist = setOf(bank)
    private fun processor() = CaptureProcessor({ whitelist }, repo, notifier, RecordingHealth(), { now }, { "id-${ids++}" })

    private fun draft(id: String, status: DraftStatus = DraftStatus.PENDING, created: Long = now) = Draft(
        id, ParsedCandidate(1_000L, "Demo", Kind.EXPENSE, Confidence.HIGH, null, "f$id"), created, created, status,
    )

    // RIESGO-06 (a): la ventana de 2 minutos se renueva con cada duplicado y se come compras reales posteriores.
    @Test
    fun `la ventana de duplicados se mide desde el ultimo gasto GUARDADO, no se renueva con cada repeticion (a)`() {
        val p = processor()
        assertEquals(Outcome.STORED, p.process(bank, null, purchase, now))   // t = 0
        now += 100_000
        p.process(bank, null, purchase, now)                                  // t = 100 s: repeticion (descartada)
        now += 100_000
        // t = 200 s: han pasado 200 s desde el gasto guardado; es una compra nueva (otro cafe). Hoy se descarta en silencio.
        assertEquals("PERDIDA SILENCIOSA: compra real a los 200 s descartada porque la ventana se renovo", Outcome.STORED, p.process(bank, null, purchase, now))
    }

    // (g): la app propia en la lista blanca se alimenta con sus propias notificaciones («$X en Comercio»).
    @Test
    fun `el servicio nunca acepta su propio paquete aunque este en la lista blanca (g)`() {
        whitelist = setOf(bank, own)
        val p = processor()
        assertFalse("accepts(own) deberia ser false para evitar el bucle notificacion -> captura -> notificacion", p.accepts(own))
        assertEquals(Outcome.IGNORED_PACKAGE, p.process(own, "Gasto detectado", "$6.500 en Cafe Demo Norte", now))
        assertTrue(repo.list().isEmpty())
    }

    // (g): una notificacion actualizada (mismo aviso, mas detalle) crea dos borradores.
    @Test
    fun `una notificacion actualizada con mas detalle no crea un segundo borrador (g)`() {
        val p = processor()
        p.process(bank, null, "Cargo por $4.000 aprobado en tu tarjeta *0000.", now)
        now += 20_000
        p.process(bank, null, "Compra aprobada por $4.000 en KIOSCO DEMO.", now)
        assertEquals("el mismo cargo de \$4.000 dentro de 20 s quedo como ${repo.list().size} borradores", 1, repo.list().size)
    }

    // (d): «Guardar» en la notificacion confirma el borrador; si la app no se abre en 7 dias desaparece sin avisar.
    @Test
    fun `un borrador confirmado con Guardar no caduca en silencio a los 7 dias (d)`() {
        repo.add(draft("a", DraftStatus.CONFIRMED, created = now))
        now += 8L * 24 * 60 * 60 * 1000
        assertTrue("la persona pulso Guardar y el gasto desaparecio sin llegar al servidor ni avisar", repo.list().any { it.id == "a" })
    }

    // (d)/(h): sin dueno. Un borrador no sabe de que usuario/hogar es: se le aplica a quien abra la app despues.
    @Test
    fun `el borrador guarda a que sesion pertenece para no filtrarse a otro usuario (d, h)`() {
        val fields = Draft::class.java.declaredFields.map { it.name }.toSet()
        assertTrue("Draft no tiene ownerId/householdId: $fields", fields.any { it.contains("owner", true) || it.contains("household", true) || it.contains("user", true) })
    }

    // (e): sin paquete de origen no hay modo automatico por app ni trazabilidad.
    @Test
    fun `el borrador conserva el paquete de origen (e)`() {
        val fields = Draft::class.java.declaredFields.map { it.name }.toSet()
        assertTrue("Draft no tiene packageName: $fields", fields.any { it.contains("package", true) || it.contains("source", true) })
    }

    // Concurrencia: servicio (hilo principal) y plugin (hilo de Capacitor) leen-modifican-escriben el mismo archivo.
    @Test
    fun `agregar borradores desde varios hilos no pierde ninguno`() {
        val slow = object : cl.dinovance.contigo.security.BlobStorage {
            @Volatile var data: ByteArray? = null
            override fun read(): ByteArray? { Thread.sleep(2); return data }
            override fun write(bytes: ByteArray) { data = bytes }
            override fun delete() { data = null }
        }
        val shared: DraftRepository = EncryptedDraftRepository(slow, JvmAesCipher()) { now }
        val pool = Executors.newFixedThreadPool(6)
        val go = CountDownLatch(1)
        repeat(24) { i -> pool.submit { go.await(); shared.add(draft("d$i")) } }
        go.countDown()
        pool.shutdown()
        pool.awaitTermination(30, java.util.concurrent.TimeUnit.SECONDS)
        assertEquals("se agregaron 24 y quedaron ${shared.list().size}: actualizaciones perdidas por carrera", 24, shared.list().size)
    }

    // «Borrar todo»: tras clear() no queda ningun rastro cifrado en disco.
    @Test
    fun `clear deja el archivo de borradores sin contenido`() {
        repo.add(draft("a"))
        repo.clear()
        assertTrue(repo.list().isEmpty())
        assertTrue("el archivo debe borrarse", storage.bytes == null)
    }

    // Aviso malformado: Error (no Exception) tambien debe quedar contenido, el servicio no puede caerse.
    @Test
    fun `process no deja escapar un Error (OutOfMemory, StackOverflow) hacia el servicio (g)`() {
        val boom = object : cl.dinovance.contigo.capture.DraftNotifier {
            override fun show(draft: Draft) { throw StackOverflowError() }
            override fun cancel(draftId: String) {}
        }
        val p = CaptureProcessor({ whitelist }, repo, boom, RecordingHealth(), { now }, { "id-x" })
        val outcome = try { p.process(bank, null, purchase, now) } catch (t: Throwable) { null }
        assertEquals("un StackOverflowError escapo de process(): el servicio de notificaciones se caeria", Outcome.FAILED, outcome)
    }

    // (c)/(h): SecureKeyValueStore usa android.util.AtomicFile (no simulable en JVM): se revisa el codigo fuente.
    // Si la clave de Keystore se pierde o el archivo se daña, get() lanza GeneralSecurityException hacia el plugin y la
    // sesion / la cola quedan ilegibles para siempre; EncryptedDraftRepository ya lo resuelve con discardUnreadable().
    @Test
    fun `SecureKeyValueStore get tolera un archivo ilegible en vez de lanzar (c, h)`() {
        val src = java.io.File("src/main/kotlin/cl/dinovance/contigo/security/SecureKeyValueStore.kt").readText()
        val get = src.substringAfter("fun get(").substringBefore("fun set(")
        assertTrue("get() no captura GeneralSecurityException: un Keystore invalidado deja la sesion y la cola irrecuperables", get.contains("GeneralSecurityException") || get.contains("catch"))
    }
}
