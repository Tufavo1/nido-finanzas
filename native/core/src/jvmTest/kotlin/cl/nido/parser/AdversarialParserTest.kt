// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

/**
 * QA adversarial: textos SINTETICOS que NO son un gasto pero traen un monto con `$`. Un falso positivo es un gasto
 * inventado en el hogar; en modo automatico se guardaria solo. Cada caso falla si el parser devuelve un candidato.
 */
class AdversarialParserTest {
    private val parser = Fixtures.parser()
    private val pkg = "cl.demo.banco"
    private val at = 1_795_273_230_000L

    @ParameterizedTest(name = "no es gasto: {0}")
    @ValueSource(strings = [
        "Tu PIN para comprar $15.000 es 4821. No lo compartas.",
        "OTP 553201 para autorizar tu compra de $15.000.",
        "Token de seguridad 553201: autoriza el pago de $15.000 en TIENDA DEMO.",
        "Codigo de autorizacion 8841 por $15.000 en TIENDA DEMO.",
        "CÓDIGO DE VERIFICACIÓN 8841 para tu compra de $15.000.",
        "Ingresa 8841 para confirmar la compra por $15.000 en TIENDA DEMO.",
        "Compra no aprobada por $15.000 en TIENDA DEMO.",
        "Compra declinada por $15.000 en TIENDA DEMO.",
        "Transaccion fallida por $15.000 en TIENDA DEMO.",
        "Tienes un crédito preaprobado de $3.000.000. Solicítalo hoy.",
        "Tu cupo disponible es de $450.000 en tu tarjeta *0000.",
        "Tu línea de crédito disponible es de $1.200.000.",
        "Tu pago mínimo de $45.000 vence el 25/11/2026.",
        "Recuerda pagar $45.000 de tu tarjeta antes del 25/11/2026.",
        "Tu estado de cuenta de noviembre: monto facturado $320.000.",
        "Participa y gana $500.000 en nuestro sorteo.",
        "Gana $10.000 invitando a un amigo.",
        "Aviso: se intentó una compra por $15.000 en TIENDA DEMO que no reconocemos. Si no fuiste tú, llámanos.",
        "Alerta de seguridad: compra sospechosa por $15.000 en TIENDA DEMO.",
        "Bloqueamos tu tarjeta *0000 tras un intento de compra por $15.000.",
    ])
    fun `avisos que no son un gasto devuelven null`(text: String) {
        assertNull(parser.parse(pkg, "Banco Demo", text, at))
    }

    @Test
    fun `un texto de 2000 caracteres patologico se procesa rapido y sin lanzar nada`() {
        val inputs = listOf(
            "$1.".repeat(700),
            "1.".repeat(1000),
            " en ".repeat(500),
            "Compra por $1.000 en " + "a ".repeat(1000),
            "(".repeat(1000) + "$1.000" + ")".repeat(1000),
            "cuota ".repeat(300) + " de ".repeat(300),
            "$ ".repeat(1000),
            "́".repeat(2000),
            "Compra por $1.000 en " + "Ñ̃".repeat(900),
        )
        for (text in inputs) {
            val start = System.nanoTime()
            try {
                parser.parse(pkg, text, text, at)
            } catch (t: Throwable) {
                throw AssertionError("lanzó ${t.javaClass.simpleName} con un texto de ${text.length} caracteres", t)
            }
            val ms = (System.nanoTime() - start) / 1_000_000
            assertTrue(ms < 500, "tardó $ms ms con un texto de ${text.length} caracteres")
        }
    }

    @Test
    fun `el comercio nunca incluye saltos de linea ni caracteres de control`() {
        val got = parser.parse(pkg, null, "Compra por \$1.000 en TIENDA\u0007DEMO‮ EVIL", at)
        val merchant = got?.merchant.orEmpty()
        assertTrue(merchant.none { it.isISOControl() || it == '‮' }, "comercio con caracteres de control: ${merchant.map { it.code }}")
    }

    @Test
    fun `la misma compra con montos en formatos distintos da el mismo monto`() {
        val a = parser.parse(pkg, null, "Compra por \$12.990 en TIENDA DEMO", at)!!.amountClp
        val b = parser.parse(pkg, null, "Compra por \$12 990 en TIENDA DEMO", at)?.amountClp
        val c = parser.parse(pkg, null, "Compra por \$12,990 en TIENDA DEMO", at)?.amountClp
        assertEquals(12_990L, a)
        // «$12 990» y «$12,990» no se pueden confundir con 12 pesos: o dan 12.990, o no dan gasto (null). Nunca 12.
        assertTrue(b == null || b == 12_990L, "«\$12 990» se leyó como $b")
        assertTrue(c == null || c == 12_990L, "«\$12,990» se leyó como $c")
    }
}
