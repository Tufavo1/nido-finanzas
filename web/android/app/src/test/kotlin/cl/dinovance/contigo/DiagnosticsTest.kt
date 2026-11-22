// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.MaskText
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.TextStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticsTest {
    private val bank = "cl.demo.banco"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private var now = 1_795_273_230_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private val store = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val diag = DiagnosticsLog(store) { now }
    private val notifier = RecordingNotifier()
    private var cfgAuto = true
    private var cap = 50_000L
    private var ownerNow: String? = owner
    private var profile: AutoProfile? = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Cafe Demo Norte") to cat))
    private var notifOk = true
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "santander" else null
        override fun autoEnabled(bank: String) = cfgAuto
        override fun maxClp() = cap
    }
    private fun p() = CaptureProcessor(
        { setOf(bank) }, repo, notifier, RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { ownerNow }, requireOwner = true, auto = cfg, profile = { profile }, diag = diag, notificationsAllowed = { notifOk },
    )
    private fun reasons() = diag.list().map { it.reason }

    @Test
    fun `el texto se enmascara, digitos a almohadilla, se conservan signo de pesos, puntos, comas y letras`() {
        assertEquals("Compra por \$#.### en Cafe, tarjeta ****-####", MaskText.mask("Compra por \$4.500 en Cafe, tarjeta ****-1234"))
        assertEquals("#", MaskText.mask("7")); assertEquals("", MaskText.mask(null))
        assertEquals(300, MaskText.mask("a".repeat(900)).length)
    }

    @Test
    fun `un aviso con formato desconocido deja diagnostico NO_AMOUNT con el texto enmascarado`() {
        p().process(bank, "Banco", "Hola, revisa tu cuenta 12345", now)
        val e = diag.list().single()
        assertEquals(DiagReason.NO_AMOUNT, e.reason); assertEquals("santander", e.bankId)
        assertFalse(e.maskedText.any { it.isDigit() }); assertTrue(e.maskedText.contains("revisa tu cuenta"))
    }

    @Test
    fun `no es gasto, duplicado, sin sesion y bandeja llena tienen motivo`() {
        p().process(bank, null, "Tu clave es 123456", now)
        p().process(bank, null, "Abono recibido por \$10.000 de Juan", now)
        assertEquals(listOf(DiagReason.NOT_AN_EXPENSE, DiagReason.INCOME), reasons().reversed())
        val proc = p(); now += 100_000
        proc.process(bank, null, "Compra por \$4.500 en Cafe Demo Norte", now)
        proc.process(bank, null, "Compra por \$4.500 en Cafe Demo Norte", now + 1_000)
        assertTrue(reasons().contains(DiagReason.DUPLICATE))
        ownerNow = null; now += 200_000
        p().process(bank, null, "Compra por \$7.000 en Tienda Uno", now)
        assertEquals(DiagReason.NO_SESSION, diag.list().first().reason)
    }

    @Test
    fun `por que no se guardo solo, motivos`() {
        cfgAuto = false
        p().process(bank, null, "Compra por \$4.500 en Cafe Demo Norte", now)
        assertEquals(DiagReason.BANK_OFF, diag.list().first().reason); assertEquals(DraftStatus.PENDING, repo.list().single().status)
        cfgAuto = true; now += 200_000
        p().process(bank, null, "Compra por \$4.600 en Comercio Nuevo", now)
        assertEquals(DiagReason.CATEGORY_UNKNOWN, diag.list().first().reason)
        now += 200_000
        p().process(bank, null, "Compra por \$60.000 en Cafe Demo Norte", now)
        assertEquals(DiagReason.CAP_EXCEEDED, diag.list().first().reason)
        now += 200_000; profile = null
        p().process(bank, null, "Compra por \$4.700 en Cafe Demo Norte", now)
        assertEquals(DiagReason.NO_PROFILE, diag.list().first().reason)
        profile = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Cafe Demo Norte") to cat)); now += 200_000
        p().process(bank, null, "Compra por \$4.800", now) // sin comercio: confianza media
        assertEquals(DiagReason.LOW_CONFIDENCE, diag.list().first().reason)
        now += 200_000
        p().process(bank, null, "Compra por \$4.900 en Cafe Demo Norte, comision \$9.900", now)
        assertTrue(reasons().take(2).contains(DiagReason.AMBIGUOUS_AMOUNT))
    }

    @Test
    fun `el primer gasto de un comercio nuevo queda pendiente y se muestra en la notificacion propia`() {
        p().process(bank, null, "Compra por \$4.600 en Comercio Nuevo", now)
        assertEquals(DraftStatus.PENDING, repo.list().single().status); assertEquals(1, notifier.shown.size)
    }

    @Test
    fun `con las notificaciones de Android bloqueadas el gasto queda en la bandeja y se registra el motivo`() {
        notifOk = false
        p().process(bank, null, "Compra por \$4.600 en Comercio Nuevo", now)
        assertEquals(1, repo.list().size); assertTrue(reasons().contains(DiagReason.NOTIFICATIONS_OFF))
    }

    @Test
    fun `el buffer es circular de 20, cifrado y se borra`() {
        repeat(25) { now += 1_000; diag.add(DiagReason.NO_AMOUNT, "santander", "texto $it") }
        assertEquals(20, diag.list().size)
        assertEquals("texto", diag.list().first().maskedText.take(5))
        assertFalse(store.v!!.contains("\$") && store.v!!.isEmpty())
        diag.clear(); assertTrue(diag.list().isEmpty()); assertNull(store.v)
    }

    @Test
    fun `un almacen danado no rompe el diagnostico`() {
        store.v = "{no json"
        assertTrue(diag.list().isEmpty()); diag.add(DiagReason.NO_AMOUNT, null, "x"); assertEquals(1, diag.list().size)
    }
}
