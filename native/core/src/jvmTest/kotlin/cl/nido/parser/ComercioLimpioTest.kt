// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

/**
 * Hallazgos del QA en el emulador (2026-11-24) con avisos simulados: el comercio no puede llevar pegado el medio de pago
 * («PRUEBA-EMU con Visa •••• 1234») ni quedar vacio en la Billetera en ingles («Tap to pay: CLP 7,000 at PRUEBA-EMU»).
 * Se prueba en los DOS estilos: el aviso de Billetera puede leerse como banco si la fuente no se reconocio como «Billetera Google».
 * Textos SINTETICOS con el formato de Falabella/CMR y de Billetera Google.
 */
class ComercioLimpioTest {
    private val pkg = "cl.demo.fuente"
    private val p = NotificationParser(setOf(pkg))
    private val post = 1_795_000_000_000L
    private val offset = -3L * 60 * 60 * 1000
    private val walletTitle = "Billetera de Google"

    private fun bank(t: String, title: String? = null) = p.parseDetailed(pkg, title, t, post, NoticeStyle.BANK, offset)
    private fun wallet(title: String?, t: String) = p.parseDetailed(pkg, title, t, post, NoticeStyle.WALLET, offset)
    private fun merchantOf(r: ParseResult, ctx: String): String? {
        assertNotNull(r.candidate, "$ctx -> rechazo=${r.rejection}")
        return r.candidate!!.merchant
    }

    /** Ambos estilos deben dar el mismo comercio limpio. */
    private fun bothStyles(text: String, expected: String, title: String? = walletTitle) {
        assertEquals(expected, merchantOf(bank(text, title), "BANK: $text"), "BANK: $text")
        assertEquals(expected, merchantOf(wallet(title, text), "WALLET: $text"), "WALLET: $text")
    }

    // ---------- 1) «con <medio de pago>» no es parte del comercio ----------

    @Test
    fun `el aviso del QA queda con el comercio limpio y el monto correcto`() {
        val r = bank("Pagaste \$8.500 en PRUEBA-EMU con Visa •••• 1234", walletTitle)
        assertEquals("Prueba-Emu", merchantOf(r, "QA"))
        assertEquals(8_500L, r.candidate!!.amountClp)
        bothStyles("Pagaste \$8.500 en PRUEBA-EMU con Visa •••• 1234", "Prueba-Emu")
    }

    @Test
    fun `variantes chilenas del medio de pago se cortan`() {
        for (tail in listOf(
            "con Visa •••• 1234", "con Visa ••1234", "con Visa ****1234", "con Visa *1234", "con Mastercard 1234", "con Mastercard •••• 5678",
            "con MasterCard terminada en 5678", "con Visa terminada en 1234", "con tu tarjeta", "con tu Visa", "con la tarjeta ••1234",
            "con tarjeta de crédito", "con tarjeta de débito", "con Visa Débito ••1234", "con CMR", "con tu CMR Mastercard", "Con tu CMR Mastercard",
            "con CMR Mastercard terminada en 5766", "con Redcompra", "con débito", "con crédito", "con Amex ••1234", "con American Express",
            "con Diners Club", "con Maestro", "con Tarjeta Cencosud", "con CuentaRUT", "con Cuenta RUT", "con •••• 1234", "con *1234",
            "con Google Pay", "con Billetera de Google",
        )) {
            assertEquals("Prueba-Emu", merchantOf(bank("Pagaste \$8.500 en PRUEBA-EMU $tail"), tail), "BANK: $tail")
            assertEquals("Prueba-Emu", merchantOf(wallet(walletTitle, "Pagaste \$8.500 en PRUEBA-EMU $tail"), tail), "WALLET: $tail")
        }
    }

    @Test
    fun `comercios legitimos con la palabra con no se recortan`() {
        bothStyles("Compraste \$4.500 en Pan con Palta", "Pan con Palta", title = null)
        bothStyles("Compraste \$4.500 en Café con Letras", "Café con Letras", title = null)
        bothStyles("Compraste \$4.500 en Ferretería Con Con", "Ferretería Con Con", title = null)
        bothStyles("Compraste \$4.500 en FERRETERIA CON CON", "Ferreteria Con Con", title = null)
        bothStyles("Compraste \$4.500 en Pan con Palta con Visa •••• 1234", "Pan con Palta", title = null)
        bothStyles("Compraste \$4.500 en Café con Letras con tu tarjeta", "Café con Letras", title = null)
        bothStyles("Compraste \$4.500 en Ferretería Con Con con Mastercard 1234", "Ferretería Con Con", title = null)
    }

    // ---------- 2) Billetera en ingles: el comercio va tras «at» / «to» ----------

    @Test
    fun `billetera en ingles toma el comercio tras at o to`() {
        for ((text, expected) in listOf(
            "Tap to pay: CLP 7,000 at PRUEBA-EMU" to "Prueba-Emu",
            "Tap to pay: CLP 7,000 at COPEC" to "Copec",
            "You paid CLP 7,000 at COPEC" to "Copec",
            "Paid CLP 7,000 to COPEC" to "Copec",
            "You paid CLP 7,000 at COPEC with Visa •••• 1234" to "Copec",
            "Paid CLP 7,000 at PRUEBA-EMU using Mastercard ••5678" to "Prueba-Emu",
        )) {
            assertEquals(7_000L, bank(text, "Google Wallet").candidate?.amountClp, "BANK monto: $text")
            assertEquals(expected, merchantOf(bank(text, "Google Wallet"), text), "BANK: $text")
            assertEquals(expected, merchantOf(wallet("Google Wallet", text), text), "WALLET: $text")
        }
    }

    @Test
    fun `tap to pay, you paid y at nunca son el comercio`() {
        val bad = setOf("tap to pay", "tap to pay:", "you paid", "paid", "at", "to", "google wallet")
        for (text in listOf("Tap to pay: CLP 7,000", "You paid CLP 7,000", "Paid CLP 7,000", "Tap to pay\nCLP 7,000 at")) {
            for (r in listOf(bank(text, "Google Wallet"), wallet("Google Wallet", text))) {
                val m = r.candidate?.merchant
                assert(m == null || m.lowercase() !in bad) { "$text -> $m" }
            }
        }
    }

    @Test
    fun `en espanol at y to no son palabras clave`() {
        bothStyles("Compraste \$4.500 en Tienda Atlas", "Tienda Atlas", title = null)
        bothStyles("Compraste \$4.500 en Toto Market", "Toto Market", title = null)
    }

    // ---------- 4) comercios chilenos reales en formato Falabella y Billetera ----------

    private val comercios = listOf(
        "PRUEBA-EMU" to "Prueba-Emu", "COPEC" to "Copec", "JUMBO" to "Jumbo", "LIDER" to "Lider", "UBER" to "Uber", "CABIFY" to "Cabify",
        "MERCADO LIBRE" to "Mercado Libre", "FARMACIAS AHUMADA" to "Farmacias Ahumada", "SODIMAC" to "Sodimac", "MC DONALDS" to "Mc Donalds",
        "TRANSBANK" to "Transbank",
    )

    @Test
    fun `formato Falabella CMR deja el comercio limpio`() {
        for ((raw, expected) in comercios) {
            for (t in listOf(
                "Compraste \$12.990 en $raw Santiago Chl Con tu CMR Mastercard Terminada en 5766",
                "Compraste \$12.990 en $raw Las Condes Chl Con tu CMR Mastercard",
                "Compraste \$12.990 en $raw con tu CMR",
                "Compraste \$12.990 en $raw con CMR Mastercard terminada en 5766",
                "Compraste \$30.000 en $raw en 3 cuotas de \$10.000 Con tu CMR Mastercard",
            )) assertEquals(expected, merchantOf(bank(t), t), t)
        }
    }

    @Test
    fun `formatos de Billetera dejan el comercio limpio`() {
        for ((raw, expected) in comercios) {
            // Frase con el titulo de la app (como en el emulador), en los dos estilos.
            bothStyles("Pagaste \$8.500 en $raw con Visa •••• 1234", expected)
            bothStyles("Pagaste \$8.500 en $raw con Mastercard 1234", expected)
            bothStyles("Tap to pay: CLP 8,500 at $raw", expected, title = "Google Wallet")
            bothStyles("You paid CLP 8,500 at $raw", expected, title = "Google Wallet")
            // Piezas sueltas (estilo Wallet nativo).
            assertEquals(expected, merchantOf(wallet(raw, "23 nov · CLP 8,500 · Visa ••1234"), raw), "WALLET piezas: $raw")
            assertEquals(expected, merchantOf(wallet("CLP 8,500", "$raw · Visa ••1234"), raw), "WALLET monto en titulo: $raw")
        }
    }
}
