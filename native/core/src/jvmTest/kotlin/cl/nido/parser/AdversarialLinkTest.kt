// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

/** QA adversarial del enlace profundo nido://gasto (RF-27, punto i): valores hostiles, nunca lanzar, nunca confiar en el texto. */
class AdversarialLinkTest {
    private fun parse(url: String) = ExpenseLinkParser.parse(url, 2026, 11, 21)

    @ParameterizedTest(name = "comercio hostil rechazado: {0}")
    @ValueSource(strings = [
        "nido://gasto?monto=1000&comercio=Kiosco%E2%80%AEoicsoiK",      // U+202E: invierte el texto mostrado
        "nido://gasto?monto=1000&comercio=Kiosco%E2%80%8BDemo",          // U+200B: espacio de ancho cero
        "nido://gasto?monto=1000&comercio=%E2%81%A6Demo%E2%81%A9",       // U+2066/2069: aislamiento bidi
        "nido://gasto?monto=1000&comercio=Kiosco%EF%BB%BFDemo",          // U+FEFF
        "nido://gasto?monto=1000&comercio=Kiosco%C2%ADDemo",             // U+00AD guion blando (ya es C1? no)
        "nido://gasto?monto=1000&comercio=%E2%80%A8Demo",                // U+2028 separador de linea
    ])
    fun `caracteres de formato invisibles en el comercio se rechazan`(url: String) {
        assertTrue(parse(url) is ExpenseLink.Invalid, "el comercio con caracteres invisibles o de direccion se acepto: $url")
    }

    @ParameterizedTest(name = "no lanza con: {0}")
    @ValueSource(strings = [
        "nido://gasto?monto=1000&comercio=%FF%FE%FD",
        "nido://gasto?monto=1000&comercio=%",
        "nido://gasto?monto=1000&comercio=%zz",
        "nido://gasto?monto=1000&comercio=%E2%80",
        "nido://gasto?monto=%00",
        "nido://gasto?&&&=&=&monto=1000",
        "nido://gasto?monto=1000&fecha=2026-13-45",
        "nido://gasto?monto=1000&fecha=0000-00-00",
        "nido://gasto?monto=1000&fecha=99999-01-01",
        "nido://gasto?monto=１２３４",
    ])
    fun `entradas malformadas dan un resultado, nunca una excepcion`(url: String) {
        parse(url)
    }

    @Test
    fun `una URL de 200 mil caracteres se resuelve rapido y sin lanzar`() {
        val url = "nido://gasto?monto=1000&comercio=" + "a".repeat(200_000)
        val start = System.nanoTime()
        assertTrue(parse(url) is ExpenseLink.Invalid)
        assertTrue((System.nanoTime() - start) / 1_000_000 < 500)
    }

    @Test
    fun `un monto con digitos de ancho completo no se interpreta como numero`() {
        assertTrue(parse("nido://gasto?monto=１２３４") is ExpenseLink.Invalid)
    }

    @Test
    fun `una ruta extra o un usuario en la direccion no se aceptan`() {
        for (u in listOf("nido://gasto/extra?monto=1000", "nido://usuario@gasto?monto=1000", "nido://gasto:80?monto=1000", "nido://gasto#?monto=1000")) {
            assertTrue(parse(u) is ExpenseLink.Invalid, u)
        }
    }

    @Test
    fun `el comercio decodificado no pasa de 60 caracteres aunque venga muy codificado`() {
        val ok = parse("nido://gasto?monto=1000&comercio=" + "%C3%91".repeat(60))
        val tooLong = parse("nido://gasto?monto=1000&comercio=" + "%C3%91".repeat(61))
        assertTrue(ok is ExpenseLink.Valid)
        assertTrue(tooLong is ExpenseLink.Invalid)
    }
}
