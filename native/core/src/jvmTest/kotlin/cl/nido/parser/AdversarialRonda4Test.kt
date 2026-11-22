// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** QA ronda 4: avisos oficiales de Falabella/CMR y variantes hostiles. Datos SINTETICOS. ROJO = defecto actual. */
class AdversarialRonda4Test {
    private val pkg = "cl.demo.cmr"
    private val p = NotificationParser(setOf(pkg))
    private fun parse(t: String, title: String? = null) = p.parseDetailed(pkg, title, t, 1_700_000_000_000)
    private fun cand(t: String) = parse(t).candidate

    // ---- avisos oficiales exactos
    @Test fun `oficial 1 compra con debito`() {
        val x = cand("Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl Con tu Debito Banco Falabella")!!
        assertEquals(Kind.EXPENSE, x.kind); assertEquals(6_778L, x.amountClp); assertEquals("Ganaderia Rio Bueno S.a", x.merchant)
    }
    @Test fun `oficial 2 compra CMR terminada en`() {
        val x = cand("Compraste \$20.798 en Merpago Joseestebanrom Las Condes Chl Con tu CMR Mastercard PRemium Terminada en 5766. Si no la realisaste tu, revisa los movimientos de tus adicionales en tu app.")!!
        assertEquals(Kind.EXPENSE, x.kind); assertEquals(20_798L, x.amountClp); assertEquals("CMR Mastercard Premium ·5766", x.account)
    }
    @Test fun `oficial 3 recibiste es ingreso`() {
        val x = cand("Recibiste \$10.000 Te trasnfirieron \$10.000 a tu Cuenta Banco Falabella 2236. !Ingresa a la App y revisa tus movimientos!")!!
        assertEquals(Kind.INCOME, x.kind); assertEquals(10_000L, x.amountClp)
    }
    @Test fun `oficial 4 pago de CMR es pago de deuda`() {
        val x = cand("Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app")!!
        assertEquals(Kind.DEBT_PAYMENT, x.kind); assertEquals(34_400L, x.amountClp)
    }

    // ---- repeticion y huella
    @Test fun `el mismo aviso dos veces da la misma huella y dos pagos iguales de otra hora se distinguen por el texto`() {
        val t = "Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app"
        assertEquals(cand(t)!!.fingerprint, cand(t)!!.fingerprint)
        val a = p.parse(pkg, null, t, 1_700_000_000_000)!!; val b = p.parse(pkg, null, t, 1_700_000_000_000 + 3_600_000)!!
        assertNotEquals(a.fingerprint, b.fingerprint, "una hora despues es otro pago: otra huella")
    }
    @Test fun `ingreso y gasto del mismo monto tienen huellas distintas`() {
        val g = cand("Compraste \$10.000 en Tienda Demo Con tu Debito Banco Falabella")!!
        val i = cand("Recibiste \$10.000 Te transfirieron \$10.000 a tu Cuenta Banco Falabella 2236.")!!
        assertNotEquals(g.fingerprint, i.fingerprint)
    }

    // ---- hostiles
    @Test fun `la cuenta no lleva caracteres de control, bidi ni etiquetas`() {
        val x = cand("Compraste \$5.000 en Tienda Demo Con tu ‮<b>Banco\u0000 Falabella</b>")
        val acc = x?.account
        if (acc != null) assertFalse(acc.any { it.isISOControl() || it == '‮' || it == '<' || it == '>' }, acc)
    }
    @Test fun `comercio con comillas y JSON no cambia el tipo ni el monto`() {
        val x = cand("Compraste \$5.000 en x\",\"kind\":\"INCOME\",\"amount\":1 Con tu Debito Banco Falabella")!!
        assertEquals(Kind.EXPENSE, x.kind); assertEquals(5_000L, x.amountClp)
    }
    @Test fun `la cuenta NUNCA guarda mas de 4 digitos consecutivos (numero completo)`() {
        for (t in listOf(
            "Recibiste \$10.000 Te transfirieron \$10.000 a tu Cuenta Banco Falabella 12345678. !Ingresa!",
            "Compraste \$5.000 en Tienda Demo Con tu Tarjeta 4111111111111111",
            "Pagaste \$34.400 a tu CMR 4111111111111111. Revisa",
        )) {
            val acc = cand(t)?.account ?: continue
            assertFalse(Regex("\\d{5,}").containsMatchIn(acc), "numero completo en la cuenta: $acc")
        }
    }
    @Test fun `un comercio con palabras de ingreso sigue siendo gasto si el aviso empieza con Compraste`() {
        for (m in listOf("Abono Metro", "Deposito Demo", "Reembolso Fast", "Devolucion Express")) {
            val x = cand("Compraste \$5.000 en $m Santiago Chl Con tu Debito Banco Falabella")!!
            assertEquals(Kind.EXPENSE, x.kind, "«$m» no vuelve ingreso una compra")
        }
    }
    @Test fun `un comercio que dice Pagaste a tu CMR no vuelve pago de deuda una compra`() {
        val x = cand("Compraste \$9.990 en Pagaste a tu CMR Store Santiago Chl Con tu Debito Banco Falabella")!!
        assertEquals(Kind.EXPENSE, x.kind)
    }
    @Test fun `un ingreso disfrazado de gasto (Recibiste dentro de una compra) no se toma por gasto ni por ingreso del monto equivocado`() {
        val x = cand("Recibiste \$10.000 Te transfirieron. Compraste \$500 en Kiosko")
        if (x != null) { assertEquals(Kind.INCOME, x.kind); assertEquals(10_000L, x.amountClp) }
    }
    @Test fun `negacion No pagaste a tu CMR no es un pago de deuda`() {
        val x = cand("No pagaste \$34.400 a tu CMR Mastercard Premium. Tu pago no se pudo procesar")
        assertTrue(x == null || x.kind != Kind.DEBT_PAYMENT, "un pago NO realizado no debe llegar como pago de deuda")
    }
    @Test fun `Pagaste en un comercio sigue siendo gasto y Pagaste a un tercero no es pago de deuda`() {
        assertEquals(Kind.EXPENSE, cand("Pagaste \$5.000 en Cafe Demo Con tu Debito Banco Falabella")!!.kind)
        assertEquals(Kind.EXPENSE, cand("Pagaste \$5.000 a tu amigo Pedro")?.kind ?: Kind.EXPENSE)
    }
    @Test fun `montos enormes no producen un candidato que la base rechazaria (tope de 10 mil millones)`() {
        for (t in listOf("Compraste \$99.999.999.999 en Tienda Demo Con tu Debito Banco Falabella", "Recibiste \$99.999.999.999 a tu Cuenta Banco Falabella 2236", "Pagaste \$12.345.678.901 a tu CMR Mastercard Premium")) {
            val x = cand(t)
            assertTrue(x == null || x.amountClp < 10_000_000_000L, "monto ${x?.amountClp} sobre el tope de la base")
        }
    }
    @Test fun `monto cero o con signo no genera candidato de ingreso ni de deuda`() {
        assertTrue(cand("Recibiste \$0 a tu Cuenta Banco Falabella 2236")?.amountClp?.let { it > 0 } ?: true)
        assertTrue(cand("Pagaste \$0 a tu CMR Mastercard Premium")?.amountClp?.let { it > 0 } ?: true)
    }
    @Test fun `un paquete no permitido nunca se lee aunque diga Recibiste`() {
        assertEquals(null, NotificationParser(setOf("otro")).parse(pkg, null, "Recibiste \$10.000 a tu Cuenta Banco Falabella 2236", 1))
    }
    @Test fun `el candidato nunca contiene el texto bruto (ingreso y pago)`() {
        val x = cand("Recibiste \$10.000 Te trasnfirieron \$10.000 a tu Cuenta Banco Falabella 2236. !Ingresa a la App y revisa tus movimientos!")!!
        assertFalse(x.toString().contains("Ingresa a la App"))
        val y = cand("Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app")!!
        assertFalse(y.toString().contains("Revisa"))
    }
    @Test fun `parseDetailed da candidato o motivo, nunca ambos vacios`() {
        for (t in listOf("", " ", "Recibiste", "Pagaste a tu CMR", "Compraste", "Recibiste \$", "Pagaste \$34.400 a tu")) {
            val r = parse(t); assertTrue(r.candidate != null || r.rejection != null, t)
        }
        assertNotNull(parse("Compraste \$1.000 en Tienda Demo").candidate)
    }
}
