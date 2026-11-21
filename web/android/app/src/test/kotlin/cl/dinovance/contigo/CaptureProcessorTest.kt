// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.Outcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureProcessorTest {
    private val bank = "cl.demo.banco"
    private val purchase = "Compra aprobada por $12.990 en ALMACEN DEMO SPA con tu tarjeta *0000 el 14/11/2026."
    private var now = 1_795_273_230_000L
    private var ids = 0
    private val storage = MemoryStorage()
    private val repo: DraftRepository = EncryptedDraftRepository(storage, JvmAesCipher()) { now }
    private val notifier = RecordingNotifier()
    private val health = RecordingHealth()
    private var whitelist = setOf(bank)

    private fun processor() = CaptureProcessor({ whitelist }, repo, notifier, health, { now }, { "id-${ids++}" })

    @Test
    fun `un aviso de compra queda en la cola cifrada y muestra una notificacion`() {
        assertEquals(Outcome.STORED, processor().process(bank, "Banco Demo", purchase, now))
        assertEquals(1, notifier.shown.size)
        assertEquals(12_990L, repo.list().single().candidate.amountClp)
    }

    @Test
    fun `el archivo en disco no contiene monto, comercio ni texto del aviso (CA-05-1)`() {
        processor().process(bank, "Banco Demo", purchase, now)
        val disk = String(storage.bytes!!, Charsets.ISO_8859_1)
        listOf("12990", "12.990", "ALMACEN", "Almacen", "Compra aprobada", "Banco Demo").forEach { assertFalse(it, disk.contains(it)) }
    }

    @Test
    fun `un paquete fuera de la lista no se procesa ni se guarda (CA-01-1, CA-01-4)`() {
        val p = processor()
        assertFalse(p.accepts("com.ejemplo.redsocial"))
        assertEquals(Outcome.IGNORED_PACKAGE, p.process("com.ejemplo.redsocial", null, purchase, now))
        whitelist = emptySet()
        assertEquals(Outcome.IGNORED_PACKAGE, p.process(bank, null, purchase, now))
        assertTrue(repo.list().isEmpty())
    }

    @Test
    fun `el mismo aviso dos veces en menos de 2 minutos no crea un segundo borrador (CA-04-1)`() {
        val p = processor()
        assertEquals(Outcome.STORED, p.process(bank, null, purchase, now))
        now += 30_000
        assertEquals(Outcome.DUPLICATE, p.process(bank, null, purchase, now))
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `pasado el plazo se trata como gasto nuevo (CA-04-2)`() {
        val p = processor()
        p.process(bank, null, purchase, now)
        now += CaptureProcessor.DEDUPE_WINDOW_MILLIS + 1
        assertEquals(Outcome.STORED, p.process(bank, null, purchase, now))
    }

    @Test
    fun `otro comercio con el mismo monto no es duplicado (CA-04-3)`() {
        val p = processor()
        p.process(bank, null, purchase, now)
        assertEquals(Outcome.STORED, p.process(bank, null, purchase.replace("ALMACEN DEMO SPA", "TIENDA DEMO SUR"), now + 1_000))
    }

    @Test
    fun `OTP, promociones, saldos y abonos no generan borrador`() {
        val p = processor()
        listOf(
            "Clave para compra de $35.000 en COMERCIO DEMO: 771204. No compartas este código.",
            "¡Oferta exclusiva! Ahorra $5.000 en tu próxima compra.",
            "Tu saldo disponible es de $210.000 al 14/11.",
            "Abono de $350.000 en tu cuenta corriente demo.",
        ).forEach { assertEquals(Outcome.NOT_A_MOVEMENT, p.process(bank, null, it, now)) }
        assertTrue(repo.list().isEmpty())
        assertTrue(notifier.shown.isEmpty())
    }

    @Test
    fun `un aviso malformado nunca lanza, se cuenta el fallo y se sigue`() {
        val p = processor()
        val weird = listOf(null, "", "   ", "\u0000\u0000", "$".repeat(5_000), "9".repeat(40_000), "${"$1.".repeat(3_000)}", "\uD83D")
        weird.forEach { text -> p.process(bank, text, text, now) }
        assertEquals(Outcome.STORED, p.process(bank, null, purchase, now + 500_000))
    }

    @Test
    fun `si la cola o la notificacion fallan, el servicio no se cae`() {
        val failing = CaptureProcessor({ whitelist }, repo, object : cl.dinovance.contigo.capture.DraftNotifier {
            override fun show(draft: cl.dinovance.contigo.capture.Draft) = throw IllegalStateException("sin canal")
            override fun cancel(draftId: String) = Unit
        }, health, { now }, { "x" })
        assertEquals(Outcome.FAILED, failing.process(bank, null, purchase, now))
        assertEquals(listOf("IllegalStateException"), health.failures)
    }

    @Test
    fun `la cola tiene tope y avisa cuando esta llena`() {
        val p = processor()
        repeat(EncryptedDraftRepository.MAX_DRAFTS) { i -> assertEquals(Outcome.STORED, p.process(bank, null, "Compra por ${1_000 + i} pesos en Tienda $i.", now + i * 200_000L)) }
        assertEquals(Outcome.QUEUE_FULL, p.process(bank, null, "Compra por 777 pesos en Tienda Extra.", now + 99_000_000L))
    }

    @Test
    fun `un borrador sin confirmar por mas de 7 dias se elimina (CA-05-3)`() {
        processor().process(bank, null, purchase, now)
        now += EncryptedDraftRepository.MAX_AGE_MILLIS + 1
        assertTrue(repo.list().isEmpty())
    }

    @Test
    fun `si el archivo esta alterado se descarta en vez de fallar`() {
        processor().process(bank, null, purchase, now)
        storage.bytes = storage.bytes!!.also { it[it.size - 1] = (it[it.size - 1] + 1).toByte() }
        assertTrue(repo.list().isEmpty())
        assertEquals(null, storage.bytes)
    }
}
