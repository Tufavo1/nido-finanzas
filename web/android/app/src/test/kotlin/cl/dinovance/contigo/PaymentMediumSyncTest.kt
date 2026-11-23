// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.sync.ExpenseSyncer
import cl.dinovance.contigo.sync.HttpResult
import cl.dinovance.contigo.sync.HttpTransport
import cl.dinovance.contigo.sync.SessionSource
import cl.dinovance.contigo.sync.SyncStatusStore
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Medio de pago: una compra con la CMR viaja como tarjeta; con debito o sin medio claro no manda nada (la base pone 'debito'). Datos SINTETICOS. */
class PaymentMediumSyncTest {
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private val profile = AutoProfile("u1:h1", uid, hid, uid, true, mapOf(MerchantKey.of("Cafe Conocido") to cat), defaultCategoryId = cat)

    private fun draft(account: String?, kind: Kind = Kind.EXPENSE) = Draft(
        id = "55555555-5555-4555-8555-555555555555",
        candidate = ParsedCandidate(10_399, "Cafe Conocido", kind, Confidence.HIGH, null, "fp", account),
        postedAtMillis = 1_795_273_230_000L, createdAtMillis = 1_795_273_230_000L,
        status = DraftStatus.PENDING, sourcePackage = "cl.demo.falabella",
    )

    private class Sess : SessionSource { override fun accessToken(nowSeconds: Long) = "tok"; override fun refresh() = false }
    private class St : SyncStatusStore { override fun recordSuccess(nowMillis: Long) {}; override fun recordError(kind: String, nowMillis: Long) {} }
    private class Net : HttpTransport { override fun post(url: String, headers: Map<String, String>, body: String) = HttpResult(201, "") }
    private val repo: DraftRepository = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { 1_795_273_230_000L }
    private val syncer = ExpenseSyncer(repo, { profile }, { "u1:h1" }, { "https://api.demo.test/supabase" }, Sess(), Net(), St(), { 1_795_273_230_000L })

    private fun row(d: Draft): JSONObject? = syncer.rowOf(d, profile)

    @Test
    fun `una compra con la CMR se envia como tarjeta`() {
        val r = row(draft("CMR Mastercard Premium ·5766"))!!
        assertEquals("tarjeta", r.getString("payment_method"))
        assertFalse("la app nativa no conoce la deuda: no manda card_debt_id", r.has("card_debt_id"))
    }

    @Test
    fun `una compra con debito o sin medio claro no manda payment_method`() {
        assertFalse(row(draft("Débito Banco Falabella"))!!.has("payment_method"))
        assertFalse(row(draft(null))!!.has("payment_method"))
        assertFalse(row(draft("Tarjeta"))!!.has("payment_method"))
    }

    @Test
    fun `un ingreso nunca lleva medio de pago y el pago a la CMR sigue sin enviarse solo`() {
        assertFalse(row(draft("Cuenta Banco Falabella ·2236", Kind.INCOME))!!.has("payment_method"))
        assertTrue(row(draft("CMR Mastercard Premium", Kind.DEBT_PAYMENT)) == null)
    }
}
