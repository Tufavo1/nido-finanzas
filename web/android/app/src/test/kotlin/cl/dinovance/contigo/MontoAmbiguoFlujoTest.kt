// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.BankPresets
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.Outcome
import cl.nido.parser.PaymentMedium
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Recorrido del emulador (PRUEBA-EMU), de punta a punta en la logica: texto del aviso -> borrador -> JSON que lee el front.
 * Un aviso con dos montos (compra y comision) no se guarda solo en el telefono y el JSON lleva `ambiguousAmount` para que el
 * front tampoco lo guarde solo con la app abierta. Datos SINTETICOS.
 */
class MontoAmbiguoFlujoTest {
    private val now = 1_795_273_230_000L
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private val bank = "cl.demo.banco"
    private val cfg = object : AutoConfig {
        // Migrado (2026-11-24): banco sintetico VERIFICADO; Santander ya no se captura (BankPresets.VERIFIED)
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "banco-falabella" else null
        override fun autoEnabled(bank: String) = true
        override fun maxClp() = 50_000L
    }
    private val profile = AutoProfile(owner, uid, hid, uid, false, emptyMap(), defaultCategoryId = cat)
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private val processor = CaptureProcessor(
        { setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile },
    )

    @Test
    fun `aviso con compra y comision queda pendiente y el JSON del borrador marca el monto ambiguo`() {
        assertEquals(Outcome.STORED, processor.process(bank, null, "Compra por \$4.900 en PRUEBA-EMU Cafe, comision \$9.900", now))
        val d = repo.list().single()
        assertEquals(DraftStatus.PENDING, d.status)
        assertFalse(d.autoSaved)
        val json = d.toJson()
        assertTrue("el front debe saber que el monto es dudoso", json.optBoolean("ambiguousAmount", false))
        assertTrue("sobrevive a la cola cifrada", Draft.fromJson(json).ambiguousAmount)
    }

    @Test
    fun `un borrador viejo sin el campo se lee como antes, sin monto ambiguo`() {
        processor.process(bank, null, "Compra por \$4.900 en PRUEBA-EMU Cafe", now)
        val json = repo.list().single().toJson()
        assertFalse(json.optBoolean("ambiguousAmount", false))
        val old = JSONObject(json.toString()).apply { remove("ambiguousAmount") }
        assertFalse(Draft.fromJson(old).ambiguousAmount)
    }

    // Segundo caso del emulador: «Visa» a secas no dice credito (M2): es un gasto normal y se guarda solo bajo el tope.
    @Test
    fun `Compraste con tu Visa sin decir credito es gasto normal y se guarda solo`() {
        assertEquals(Outcome.STORED, processor.process(bank, null, "Compraste con tu Visa \$3.200 en PRUEBA-EMU Kiosco", now))
        val d = repo.list().single()
        assertEquals(DraftStatus.CONFIRMED, d.status)
        assertTrue(d.autoSaved)
        assertNotEquals(PaymentMedium.CREDIT, d.candidate.medium)
        assertNotEquals("CREDIT", d.toJson().getString("medium"))
        assertFalse(d.toJson().optBoolean("ambiguousAmount", false))
    }

    // Aviso viejo reentregado (la fecha del texto es de hace 3 dias): tampoco se guarda solo y el front debe saberlo.
    private val walletNow = 1_795_456_800_000L // 2026-11-23 15:00 en Santiago
    private val wallet = "cl.demo.wallet"
    private val walletRepo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { walletNow }
    private val walletProcessor = CaptureProcessor(
        { setOf(wallet) }, walletRepo, RecordingNotifier(), RecordingHealth(), { walletNow }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, profile = { profile },
        auto = object : AutoConfig {
            override fun bankOfPackage(packageName: String) = if (packageName == wallet) BankPresets.WALLET_ID else null
            override fun autoEnabled(bank: String) = true
            override fun maxClp() = 50_000L
        },
    )

    @Test
    fun `aviso viejo reentregado queda pendiente y el JSON del borrador lo marca`() {
        assertEquals(Outcome.STORED, walletProcessor.process(wallet, "PRUEBA-EMU Cafe", "20 nov · CLP 9,000", walletNow))
        val d = walletRepo.list().single()
        assertEquals(DraftStatus.PENDING, d.status)
        val json = d.toJson()
        assertTrue("el front debe saber que el aviso es viejo", json.optBoolean("staleDate", false))
        assertTrue("sobrevive a la cola cifrada", Draft.fromJson(json).staleDate)
    }

    @Test
    fun `un borrador viejo sin staleDate se lee como antes`() {
        walletProcessor.process(wallet, "PRUEBA-EMU Cafe", "23 nov · CLP 9,000", walletNow)
        val json = walletRepo.list().single().toJson()
        assertFalse(json.optBoolean("staleDate", false))
        assertFalse(Draft.fromJson(JSONObject(json.toString()).apply { remove("staleDate") }).staleDate)
    }
}
