// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Hallazgo de QA (2026-11-24): un aviso de prueba con un entero sin «$» ni «CLP» («Compraste 12990 PRUEBA-EMU LAS CONDES») NO es un
 * monto (puede ser un codigo o un numero de comercio: se mantiene, no se amplia lo que se guarda), pero tampoco es «otra moneda»:
 * el diagnostico debe decir «no encontre un monto».
 */
class SinSignoPesoTest {
    private val bankPkg = "cl.demo.cmr"
    private val walletPkg = "cl.demo.wallet"
    private val p = NotificationParser(setOf(bankPkg, walletPkg))
    private val post = 1_795_000_000_000L
    private val offset = -3L * 60 * 60 * 1000

    private fun check(style: NoticeStyle, title: String?, text: String) {
        val r = p.parseDetailed(if (style == NoticeStyle.WALLET) walletPkg else bankPkg, title, text, post, style, offset)
        assertNull(r.candidate, "$style «$text»: sin signo peso no hay monto")
        assertEquals(ParseRejection.NO_AMOUNT, r.rejection, "$style «$text»")
    }

    @Test
    fun `entero sin signo peso es sin monto, nunca otra moneda`() {
        for (style in NoticeStyle.entries) for (title in listOf(null, "Banco Falabella", "Google Wallet", "PRUEBA-EMU")) {
            check(style, title, "Compraste 4321 PRUEBA-EMU TIENDA")
            check(style, title, "Compraste 12990 PRUEBA-EMU LAS CONDES")
            check(style, title, "12990 PRUEBA-EMU LAS CONDES")
        }
    }
}
