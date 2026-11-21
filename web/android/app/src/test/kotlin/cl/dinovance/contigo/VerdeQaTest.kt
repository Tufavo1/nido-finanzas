// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.OwnerFilter
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.ReminderPolicy
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

/** Fase VERDE de los hallazgos de QA (H-04, H-05, H-06, H-08, wipe por prefijo). Datos sinteticos. */
class VerdeQaTest {
    private val bank = "cl.demo.banco"
    private var now = 1_795_273_230_000L
    private var ids = 0
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private var owner: String? = "u1:h1"
    private fun processor() = CaptureProcessor({ setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { "id-${ids++}" }, ownerProvider = { owner }, requireOwner = true)
    private val text = "Compra aprobada por $6.500 en CAFE DEMO NORTE."
    private fun draft(id: String, owner: String?, status: DraftStatus = DraftStatus.PENDING) =
        Draft(id, ParsedCandidate(1_000L, "Demo", Kind.EXPENSE, Confidence.HIGH, null, "f$id"), now, now, status, ownerKey = owner)

    @Test
    fun `la repeticion a los 100 s se guarda marcada como posible duplicado y las dos quedan`() {
        val p = processor()
        assertEquals(Outcome.STORED, p.process(bank, null, text, now))
        now += 100_000
        assertEquals(Outcome.STORED, p.process(bank, null, text, now))
        val list = repo.list()
        assertEquals(2, list.size)
        assertFalse(list[0].possibleDuplicate)
        assertTrue(list[1].possibleDuplicate)
    }

    @Test
    fun `sin sesion no se captura y con sesion el borrador nace con su dueno y paquete`() {
        owner = null
        assertEquals(Outcome.NO_SESSION, processor().process(bank, null, text, now))
        assertNull("sin sesion el aviso se guarda SIN dueno (R2-03)", repo.list().single().ownerKey)
        owner = "u1:h1"
        now += 200_000
        processor().process(bank, null, text, now)
        val mine = OwnerFilter.visible(repo.list(), "u1:h1").single()
        assertEquals(bank, mine.sourcePackage)
        assertEquals(listOf(null), OwnerFilter.adoptable(repo.list(), "u1:h9", "u1").map { it.ownerKey })
        assertTrue(OwnerFilter.adoptable(repo.list(), "u2:h1", "u1").isEmpty())
    }

    @Test
    fun `los borradores de otro dueno no se ven y se detectan como ajenos`() {
        val all = listOf(draft("a", "u1:h1"), draft("b", "u2:h2"), draft("c", null))
        assertEquals(listOf("a"), OwnerFilter.visible(all, "u1:h1").map { it.id })
        assertEquals(listOf("b", "c"), OwnerFilter.foreign(all, "u1:h1").map { it.id })
        assertTrue(OwnerFilter.visible(all, null).isEmpty())
    }

    @Test
    fun `el recordatorio cuenta solo lo confirmado del dueno activo`() {
        val all = listOf(draft("a", "u1:h1", DraftStatus.CONFIRMED), draft("b", "u1:h1"), draft("c", "u2:h2", DraftStatus.CONFIRMED))
        assertEquals(1, ReminderPolicy.pendingToSend(all, "u1:h1"))
        assertEquals("Tienes 2 gastos por enviar", ReminderPolicy.message(2))
        assertNull(ReminderPolicy.message(0))
    }

    @Test
    fun `removeByPrefix borra las colas y deja la sesion`() {
        val dir = createTempDir()
        File(dir, "queue.aaa.bin").writeText("x"); File(dir, "queue.bbb.bin").writeText("x"); File(dir, "ccc.bin").writeText("x")
        SecureKeyValueStore(dir, JvmAesCipher()).removeByPrefix("queue-")
        assertEquals(listOf("ccc.bin"), dir.list()!!.toList())
        dir.deleteRecursively()
    }
}
