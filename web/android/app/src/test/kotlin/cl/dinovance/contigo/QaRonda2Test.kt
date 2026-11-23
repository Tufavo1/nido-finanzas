// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.ReminderPolicy
import cl.dinovance.contigo.security.SecureKeyValueStore
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** QA ronda 2: defectos introducidos o dejados por las correcciones. Datos SINTETICOS. Cada fallo se explica en su mensaje. */
class QaRonda2Test {
    private val bank = "cl.demo.banco"
    private val owner = "u1:h1"
    private var now = 1_795_273_205_000L // 12:00:05, 5 s dentro del minuto
    private var ids = 0
    private val storage = MemoryStorage()
    private val repo: DraftRepository = EncryptedDraftRepository(storage, JvmAesCipher()) { now }
    private val health = RecordingHealth()
    private var activeOwner: String? = owner
    private fun processor(requireOwner: Boolean = true) =
        CaptureProcessor({ setOf(bank) }, repo, RecordingNotifier(), health, { now }, { "id-${ids++}" }, ownerProvider = { activeOwner }, requireOwner = requireOwner)

    private fun feed(p: CaptureProcessor, text: String) = p.process(bank, null, text, now)

    // Diseno declarado: descarte solo < 45 s; entre 45 s y 2 min se guarda como «posible duplicado».
    // Pero la huella incluye el MINUTO del aviso: dos avisos iguales del mismo minuto (p. ej. 5 s y 55 s) comparten huella y se descartan.
    @Test
    fun `dos compras iguales separadas por 50 s dentro del mismo minuto no se descartan (R2-01)`() {
        val p = processor()
        val text = "Compra aprobada por $2.500 en CAFE DEMO NORTE."
        assertEquals(Outcome.STORED, feed(p, text))
        now += 50_000 // 12:00:55: mismo minuto, 50 s despues
        assertEquals("compra real a 50 s descartada por compartir huella (la huella solo mira el minuto): contradice el diseno de 45 s", Outcome.STORED, feed(p, text))
        assertTrue(repo.list().last().possibleDuplicate)
    }

    // H-14: un aviso sin comercio se «completa» con el siguiente. Pero el borrador sigue marcado como «sin comercio» y absorbe TODO lo que venga.
    @Test
    fun `completar un borrador sin comercio no fusiona dos compras distintas (R2-02)`() {
        val p = processor()
        feed(p, "Cargo por $4.000 aprobado en tu tarjeta *0000.")
        now += 10_000
        feed(p, "Compra aprobada por $4.000 en KIOSCO ALFA.")
        now += 10_000
        feed(p, "Compra aprobada por $4.000 en KIOSCO BETA.")
        val merchants = repo.list().mapNotNull { it.candidate.merchant }
        assertTrue("KIOSCO ALFA y KIOSCO BETA son compras distintas; quedaron $merchants (la segunda pisa a la primera)", merchants.any { it.contains("Alfa", true) } && merchants.any { it.contains("Beta", true) })
    }

    // Cuando se completa un borrador la notificacion visible no se actualiza (sigue mostrando solo el monto).
    // (a) Sin sesion no hay dueno y el aviso se pierde. Al menos debe quedar constancia para avisar a la persona despues.
    @Test
    fun `los avisos que llegan sin sesion dejan constancia para avisar a la persona (R2-03)`() {
        activeOwner = null
        val p = processor()
        assertEquals(Outcome.NO_SESSION, feed(p, "Compra aprobada por $2.500 en CAFE DEMO NORTE."))
        assertTrue("el aviso se perdio sin dejar rastro: health=${health.failures}, events=${health.events}", health.failures.isNotEmpty() || health.events > 0)
    }

    // Los borradores CONFIRMED no caducan (H-05) y los de otro dueno nunca se muestran: se acumulan hasta 50 y la captura se detiene en silencio.
    @Test
    fun `borradores confirmados ajenos y viejos no bloquean la captura nueva (R2-04)`() {
        val old = now - 40L * 24 * 60 * 60 * 1000
        repeat(50) { i ->
            repo.add(Draft("old-$i", ParsedCandidate(1_000L, "Demo", Kind.EXPENSE, Confidence.HIGH, null, "fp$i"), old, old, DraftStatus.CONFIRMED, bank, "otro:hogar", false))
        }
        val out = feed(processor(), "Compra aprobada por $2.500 en CAFE DEMO NORTE.")
        assertEquals("50 borradores confirmados de hace 40 dias (de otro dueno) llenan la cola: la compra nueva se pierde ($out)", Outcome.STORED, out)
    }

    // (d) removeByPrefix: deja las demas claves y borra tambien los temporales de AtomicFile.
    @Test
    fun `removeByPrefix borra solo las colas, con sus temporales, y deja la sesion (R2-05)`() {
        val dir = java.nio.file.Files.createTempDirectory("qa-prefix").toFile()
        listOf("queue.aaaa.bin", "queue.aaaa.bin.new", "queue.bbbb.bin", "contigo.cccc.bin", "dddd.bin", "capture.eeee.bin").forEach { File(dir, it).writeText("x") }
        SecureKeyValueStore(dir, JvmAesCipher()).removeByPrefix("queue-")
        assertEquals(setOf("contigo.cccc.bin", "dddd.bin", "capture.eeee.bin"), dir.list()!!.toSet())
        dir.deleteRecursively()
    }

    @Test
    fun `removeByPrefix con un prefijo vacio o raro no borra nada (R2-06)`() {
        val dir = java.nio.file.Files.createTempDirectory("qa-prefix2").toFile()
        listOf("queue.aaaa.bin", "contigo.cccc.bin", "dddd.bin").forEach { File(dir, it).writeText("x") }
        val store = SecureKeyValueStore(dir, JvmAesCipher())
        for (p in listOf("", "-", "..", "../", "*", ".")) store.removeByPrefix(p)
        assertEquals(3, dir.list()!!.size)
        dir.deleteRecursively()
    }

    // (c) recordatorio: texto, singular/plural y que no se repita sin pendientes.
    @Test
    fun `el recordatorio solo cuenta lo confirmado del dueno activo y calla sin pendientes (R2-07)`() {
        fun d(id: String, status: DraftStatus, o: String?) = Draft(id, ParsedCandidate(1_000L, "Demo", Kind.EXPENSE, Confidence.HIGH, null, id), now, now, status, bank, o, false)
        val all = listOf(d("a", DraftStatus.CONFIRMED, owner), d("b", DraftStatus.CONFIRMED, owner), d("c", DraftStatus.PENDING, owner), d("x", DraftStatus.CONFIRMED, "otro:hogar"), d("y", DraftStatus.CONFIRMED, null))
        assertEquals(2, ReminderPolicy.pendingToSend(all, owner))
        assertEquals(0, ReminderPolicy.pendingToSend(all, null))
        assertEquals("Tienes 2 gastos por enviar", ReminderPolicy.message(2))
        assertEquals("Tienes 1 gasto por enviar", ReminderPolicy.message(1))
        assertNull(ReminderPolicy.message(0))
    }
}
