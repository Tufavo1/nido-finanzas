// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.IncomingNotice
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.NoticeLedger
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.ReminderPolicy
import cl.dinovance.contigo.capture.TextStore
import cl.dinovance.contigo.sync.ExpenseSyncer
import cl.dinovance.contigo.sync.HttpResult
import cl.dinovance.contigo.sync.HttpTransport
import cl.dinovance.contigo.sync.SessionSource
import cl.dinovance.contigo.sync.SyncStatusStore
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hallazgos del recorrido en el emulador (2026-11-23). Datos SINTETICOS. */
class RecorridoEmuTest {
    // ---- (1) compartido o personal: lo decide SOLO el perfil que manda la app

    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private class Sess : SessionSource { override fun accessToken(nowSeconds: Long) = "tok"; override fun refresh() = false }
    private class St : SyncStatusStore { override fun recordSuccess(nowMillis: Long) {}; override fun recordError(kind: String, nowMillis: Long) {} }
    private class Net : HttpTransport { override fun post(url: String, headers: Map<String, String>, body: String) = HttpResult(201, "") }

    private fun profile(shared: Boolean) = AutoProfile("u1:h1", uid, hid, uid, shared, mapOf(MerchantKey.of("Cafe Normal") to cat), defaultCategoryId = cat)
    private fun expense(id: String = "55555555-5555-4555-8555-555555555555", status: DraftStatus = DraftStatus.CONFIRMED, autoSaved: Boolean = true) = Draft(
        id, ParsedCandidate(4_800, "Cafe Normal", Kind.EXPENSE, Confidence.HIGH, null, "fp-$id"),
        1_795_273_230_000L, 1_795_273_230_000L, status, "cl.banco.demo", "u1:h1", false, cat, autoSaved,
    )

    private fun rowWith(shared: Boolean) = ExpenseSyncer(
        EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { 0L }, { profile(shared) }, { "u1:h1" }, { "https://api.demo.test/supabase" },
        Sess(), Net(), St(), { 1_795_273_230_000L },
    ).rowOf(expense(), profile(shared))!!

    @Test
    fun `un perfil personal envia el gasto guardado solo como personal y a nombre de quien lo anoto`() {
        val r = rowWith(shared = false)
        assertFalse(r.getBoolean("shared"))
        assertEquals(uid, r.getString("paid_by"))
    }

    @Test
    fun `solo un perfil compartido (elegido en la app) lo envia compartido`() {
        assertTrue(rowWith(shared = true).getBoolean("shared"))
    }

    @Test
    fun `un perfil sin el campo shared no vale (nunca se asume compartido)`() {
        val json = profile(false).toJson().replace(",\"shared\":false", "")
        assertFalse(json.contains("shared"))
        assertEquals(null, AutoProfile.parse(json))
    }

    // ---- (2) tres avisos «$4.800 en PRUEBA-EMU Cafe Normal»: cuando es el MISMO aviso y cuando es otra compra

    private val bank = "cl.banco.demo"
    private var now = 1_795_273_230_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private class Mem : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val ledgerStore = Mem()
    private var ids = 0
    private fun proc() = CaptureProcessor(
        { setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { "d${++ids}" }, ownerProvider = { "u1:h1" }, requireOwner = true,
        ledger = NoticeLedger(ledgerStore),
    )
    private val text = "Compraste \$4.800 en PRUEBA-EMU Cafe Normal"
    private fun notice(key: String, whenMillis: Long, posted: Long = now) = IncomingNotice(bank, null, text, posted, key, whenMillis)
    private fun seconds(s: Int) { now += s * 1_000L }

    @Test
    fun `misma clave y mismo when es el mismo aviso - no duplica nunca - ni tarde ni tras reiniciar el proceso`() {
        assertEquals(Outcome.STORED, proc().process(notice("tag1", 1_000)))
        seconds(5)
        assertEquals(Outcome.DUPLICATE, proc().process(notice("tag1", 1_000, posted = now)))
        seconds(3 * 60 * 60)
        assertEquals(Outcome.DUPLICATE, proc().process(notice("tag1", 1_000, posted = now)))
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `mismo texto con otro when o con otra clave es otra compra del mismo monto y cuenta (pasados 2 min)`() {
        val p = proc()
        assertEquals(Outcome.STORED, p.process(notice("tag1", 1_000)))
        seconds(3 * 60)
        assertEquals(Outcome.STORED, p.process(notice("tag1", 2_000))) // misma clave, otro when
        seconds(3 * 60)
        assertEquals(Outcome.STORED, p.process(notice("tag2", 3_000))) // otra clave
        assertEquals(3, repo.list().size)
        assertTrue(repo.list().none { it.possibleDuplicate })
    }

    @Test
    fun `a menos de 45 s el mismo texto se toma como el mismo aviso aunque cambie clave o when - entre 45 s y 2 min se guarda marcado`() {
        val p = proc()
        assertEquals(Outcome.STORED, p.process(notice("tag1", 1_000)))
        seconds(10)
        assertEquals(Outcome.DUPLICATE, p.process(notice("tag1", 2_000)))
        seconds(50) // 60 s desde el primero
        assertEquals(Outcome.STORED, p.process(notice("tag2", 3_000)))
        // El recorrido: tres avisos iguales (dos con la misma clave y uno con otra) dieron DOS gastos
        assertEquals(2, repo.list().size)
        assertTrue(repo.list().single { it.id == "d2" }.possibleDuplicate)
    }

    @Test
    fun `un aviso que se tomo por repetido sigue siendo repetido cuando el sistema lo reenvia con la misma clave y el mismo when`() {
        val p = proc()
        assertEquals(Outcome.STORED, p.process(notice("tag1", 1_000)))
        seconds(10)
        assertEquals(Outcome.DUPLICATE, p.process(notice("tag1", 2_000))) // ventana de 45 s
        seconds(5 * 60)
        // Reenvio del MISMO aviso (misma clave, mismo when): antes creaba un segundo gasto
        assertEquals(Outcome.DUPLICATE, p.process(notice("tag1", 2_000, posted = now)))
        assertEquals(Outcome.DUPLICATE, proc().process(notice("tag1", 2_000, posted = now))) // tambien tras reiniciar
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `el detalle que completo un borrador sin comercio tampoco crea otro gasto si el sistema lo reenvia`() {
        val p = proc()
        assertEquals(Outcome.STORED, p.process(IncomingNotice(bank, null, "Compra aprobada por \$4.800", now, null, 0)))
        seconds(10)
        val detail = IncomingNotice(bank, null, text, now, "tag9", 9_000)
        assertEquals(Outcome.DUPLICATE, p.process(detail))
        assertEquals("PRUEBA-EMU Cafe Normal", repo.list().single().candidate.merchant)
        seconds(5 * 60)
        assertEquals(Outcome.DUPLICATE, p.process(detail.copy(postedAtMillis = now)))
        assertEquals(1, repo.list().size)
    }

    // ---- (3) «Tienes 1 gasto por enviar» dentro de la app: solo lo que la persona guardo con «Guardar»

    @Test
    fun `lo guardado solo no cuenta como «lo guardaste desde la notificacion» - el recordatorio nativo si lo cuenta`() {
        val drafts = listOf(
            expense("55555555-5555-4555-8555-555555555551", autoSaved = true),
            expense("55555555-5555-4555-8555-555555555552", autoSaved = false),
            expense("55555555-5555-4555-8555-555555555553", status = DraftStatus.PENDING, autoSaved = false),
        )
        assertEquals(1, ReminderPolicy.savedByPerson(drafts, "u1:h1"))
        assertEquals(0, ReminderPolicy.savedByPerson(drafts.take(1), "u1:h1"))
        assertEquals(2, ReminderPolicy.pendingToSend(drafts, "u1:h1"))
    }
}
