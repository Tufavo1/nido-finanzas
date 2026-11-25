// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftActions
import cl.dinovance.contigo.capture.DraftCleanup
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.OwnerFilter
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Decision del dueno (2026-11-24): cada persona solo ve, cambia y borra SUS borradores. Dos duenos (A y B) en el mismo telefono tras
 * un cambio de cuenta: nada que entre por el puente o por una accion de notificacion con un id ajeno actua, y el resultado es el
 * mismo que para un id que no existe (no revela si el id es de otra persona). Datos SINTETICOS.
 */
class DuenoBorradoresTest {
    private val a = "uA:h1"
    private val b = "uB:h2"
    private var now = 1_795_532_400_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }

    private fun draft(id: String, owner: String?, status: DraftStatus = DraftStatus.PENDING, kind: Kind = Kind.EXPENSE) =
        Draft(id, ParsedCandidate(12_990, "PRUEBA TIENDA", kind, Confidence.HIGH, null, "f-$id"), now, now, status, "cl.demo.banco", owner)

    private fun statusOf(id: String) = repo.list().firstOrNull { it.id == id }?.status

    // ---- removeDraft (puente) e «Ignorar» (notificacion)

    @Test
    fun `B no borra el borrador de A y el resultado es el mismo que un id inexistente`() {
        repo.add(draft("a1", a))
        assertFalse(DraftActions.removeOwned(repo, "a1", b))
        assertFalse(DraftActions.removeOwned(repo, "no-existe", b))
        assertEquals(DraftStatus.PENDING, statusOf("a1"))
    }

    @Test
    fun `A borra su propio borrador`() {
        repo.add(draft("a1", a))
        repo.add(draft("b1", b))
        assertTrue(DraftActions.removeOwned(repo, "a1", a))
        assertEquals(listOf("b1"), repo.list().map { it.id })
    }

    @Test
    fun `sin sesion no se borra nada`() {
        repo.add(draft("a1", a))
        repo.add(draft("x1", null))
        assertFalse(DraftActions.removeOwned(repo, "a1", null))
        assertFalse(DraftActions.removeOwned(repo, "x1", null))
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `un borrador sin dueno no se borra por id hasta que su misma persona lo adopta`() {
        repo.add(draft("x1", null))
        assertFalse(DraftActions.removeOwned(repo, "x1", a))
        // R2-03: la misma persona (lastUser = uA) vuelve a entrar y lo adopta; recien ahi es suyo
        OwnerFilter.adoptable(repo.list(), a, "uA").forEach { d -> repo.update(d.id) { it.copy(ownerKey = a) } }
        assertTrue(DraftActions.removeOwned(repo, "x1", a))
    }

    // ---- «Guardar» desde la notificacion

    @Test
    fun `Guardar con un id de A estando B activo no confirma nada`() {
        repo.add(draft("a1", a))
        assertFalse(DraftActions.saveFromNotification(repo, "a1", b))
        assertFalse(DraftActions.saveFromNotification(repo, "a1", null))
        assertEquals(DraftStatus.PENDING, statusOf("a1"))
        assertTrue(DraftActions.saveFromNotification(repo, "a1", a))
        assertEquals(DraftStatus.CONFIRMED, statusOf("a1"))
    }

    @Test
    fun `Guardar sobre un borrador sin dueno no lo confirma`() {
        repo.add(draft("x1", null))
        assertFalse(DraftActions.saveFromNotification(repo, "x1", a))
        assertEquals(DraftStatus.PENDING, statusOf("x1"))
    }

    // ---- Abrir desde la notificacion («Revisar», «Cambiar categoria»)

    @Test
    fun `abrir un id de otro dueno o inexistente no entrega el id a la app`() {
        repo.add(draft("a1", a))
        assertNull(OwnerFilter.openable(repo.list(), b, "a1"))
        assertNull(OwnerFilter.openable(repo.list(), null, "a1"))
        assertNull(OwnerFilter.openable(repo.list(), a, "no-existe"))
        assertNull(OwnerFilter.openable(repo.list(), a, null))
        assertEquals("a1", OwnerFilter.openable(repo.list(), a, "a1"))
    }

    // ---- Cambio de cuenta: A cierra sesion y entra B en el mismo telefono

    private class Session : SessionSource {
        override fun accessToken(nowSeconds: Long) = "tok"
        override fun refresh() = true
    }
    private class Status : SyncStatusStore {
        override fun recordSuccess(nowMillis: Long) {}
        override fun recordError(kind: String, nowMillis: Long) {}
    }
    private class Net : HttpTransport {
        val sent = mutableListOf<String>()
        override fun post(url: String, headers: Map<String, String>, body: String): HttpResult { sent += url; return HttpResult(201, "") }
    }

    @Test
    fun `con B activo los borradores de A no aparecen, no se envian ni se borran desde B`() {
        // Defensa en profundidad: aun si la app solo llamo setActiveOwner(B) sin wipeForAccountSwitch
        repo.add(draft("a-pend", a))
        repo.add(draft("a-conf", a, DraftStatus.CONFIRMED))
        // A cierra sesion (sin dueno activo) y entra B
        assertTrue(OwnerFilter.visible(repo.list(), null).isEmpty())
        val active: String? = b
        assertTrue(OwnerFilter.visible(repo.list(), active).isEmpty())
        for (id in listOf("a-pend", "a-conf")) {
            assertFalse(DraftActions.removeOwned(repo, id, active))
            assertFalse(DraftActions.saveFromNotification(repo, id, active))
            assertNull(OwnerFilter.openable(repo.list(), active, id))
        }
        assertEquals(emptyList<String>(), DraftCleanup.clearPending(repo, active))
        val profileB = AutoProfile(b, "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666", "55555555-5555-4555-8555-555555555555", false, emptyMap(), defaultCategoryId = "77777777-7777-4777-8777-777777777777")
        val net = Net()
        ExpenseSyncer(repo, { profileB }, { active }, { "https://api.demo.test/supabase" }, Session(), net, Status(), { now }).syncWithReport()
        assertTrue("se envio un gasto de A con la sesion de B", net.sent.isEmpty())
        assertEquals(setOf("a-pend", "a-conf"), repo.list().map { it.id }.toSet())
        // wipeForAccountSwitch (flujo real): los de A son ajenos y se borran
        assertEquals(setOf("a-pend", "a-conf"), OwnerFilter.foreign(repo.list(), b).map { it.id }.toSet())
    }

    // ---- Concurrencia: B intenta borrar y guardar lo de A mientras A guarda y B borra lo suyo

    @Test
    fun `en paralelo B nunca toca lo de A y A y B operan bien sobre lo propio`() {
        val aIds = (1..10).map { "a$it" }
        val bIds = (1..10).map { "b$it" }
        aIds.forEach { repo.add(draft(it, a)) }
        bIds.forEach { repo.add(draft(it, b)) }
        val pool = Executors.newFixedThreadPool(8)
        val start = CountDownLatch(1)
        val tasks = mutableListOf<java.util.concurrent.Future<*>>()
        repeat(4) {
            tasks += pool.submit { start.await(); aIds.forEach { id -> DraftActions.removeOwned(repo, id, b); DraftActions.saveFromNotification(repo, id, b) } }
            tasks += pool.submit { start.await(); aIds.forEach { id -> DraftActions.saveFromNotification(repo, id, a) } }
            tasks += pool.submit { start.await(); bIds.forEach { id -> DraftActions.removeOwned(repo, id, b) } }
        }
        start.countDown()
        tasks.forEach { it.get(30, TimeUnit.SECONDS) }
        pool.shutdown()
        val left = repo.list()
        assertEquals(aIds.toSet(), left.map { it.id }.toSet())
        assertTrue(left.all { it.ownerKey == a && it.status == DraftStatus.CONFIRMED })
    }

    // ---- Cableado Android (no corre en la JVM): se revisa el fuente

    private fun src(path: String) = File("src/main/kotlin/cl/dinovance/contigo/$path").readText()
    private fun pluginBody(name: String): String {
        val p = src("plugin/ContigoNativePlugin.kt")
        val i = p.indexOf("fun $name(")
        return p.substring(i, p.indexOf("@PluginMethod", i).let { if (it < 0) p.length else it })
    }

    @Test
    fun `removeDraft del puente solo borra lo del dueno activo y responde removed`() {
        val body = pluginBody("removeDraft")
        // removeTakenByApp = removeOwned (dueno activo) + marca del registro de guardados solos (QA 2026-11-24)
        assertTrue(body.contains("DraftActions.removeTakenByApp("))
        assertTrue(body.contains("put(\"removed\""))
        assertFalse("removeDraft borra sin comprobar el dueno", body.contains("drafts.remove("))
    }

    @Test
    fun `consumePendingOpen solo entrega un id del dueno activo`() {
        assertTrue(pluginBody("consumePendingOpen").contains("OwnerFilter.openable("))
    }

    @Test
    fun `las acciones de la notificacion pasan el dueno activo`() {
        val r = src("capture/DraftActionReceiver.kt")
        assertTrue(r.contains("DraftActions.saveFromNotification(graph.drafts, id, owner)"))
        assertTrue(r.contains("DraftActions.removeOwned(graph.drafts, id, owner)"))
        assertFalse("Ignorar borra sin comprobar el dueno", r.contains("graph.drafts.remove(id)"))
    }
}
