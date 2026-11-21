// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** RF-01: lista blanca por nombre de paquete. */
class WhitelistTest {
    private val f01 = Fixtures.byId("F01")

    @Test
    fun `una app fuera de la lista da null aunque el texto sea una compra (F27)`() {
        val f27 = Fixtures.byId("F27")
        assertNull(Fixtures.parser().parse(f27.packageName, f27.title, f27.text, f27.postedAtMillis))
    }

    @Test
    fun `el mismo texto de F01 desde un paquete aprobado si se captura`() {
        assertNotNull(Fixtures.parser().parse(f01.packageName, f01.title, f01.text, f01.postedAtMillis))
    }

    @Test
    fun `con la lista vacia no se captura nada (CA-01-4)`() {
        assertNull(NotificationParser(emptySet()).parse(f01.packageName, f01.title, f01.text, f01.postedAtMillis))
    }

    @Test
    fun `quitar un paquete de la lista lo descarta (CA-01-3)`() {
        val sinBanco = NotificationParser(setOf("cl.demo.billetera"))
        assertNull(sinBanco.parse(f01.packageName, f01.title, f01.text, f01.postedAtMillis))
    }

    @Test
    fun `el paquete se compara exacto, no por prefijo ni por mayusculas`() {
        val p = Fixtures.parser()
        for (pkg in listOf("cl.demo", "cl.demo.banco.falso", "CL.DEMO.BANCO", " cl.demo.banco")) {
            assertNull(p.parse(pkg, f01.title, f01.text, f01.postedAtMillis), "paquete '$pkg'")
        }
    }
}
