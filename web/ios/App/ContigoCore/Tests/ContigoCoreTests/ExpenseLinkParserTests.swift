import XCTest
@testable import ContigoCore

// NO EJECUTADAS (requieren Xcode / un Mac: `swift test` en ios/App/ContigoCore).
// Espejo en Swift de web/src/lib/deepLink.test.ts (RF-27, CA-27-1..2). Escritas ANTES
// de la implementación; la fase "ver que falla" tampoco se pudo hacer en este equipo.
final class ExpenseLinkParserTests: XCTestCase {
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Santiago")!
        return c
    }()
    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 11, day: 21, hour: 12))! }

    private func parse(_ url: String) -> ExpenseLinkResult {
        ExpenseLinkParser.parse(url, now: now, calendar: calendar)
    }

    private func assertOk(_ url: String, amount: Int64, merchant: String?, date: String? = nil,
                          file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(parse(url), .ok(ExpenseDraft(amountClp: amount, merchant: merchant, date: date)),
                       url, file: file, line: line)
    }

    private func assertRejected(_ url: String, file: StaticString = #filePath, line: UInt = #line) {
        if case .rejected(let reason) = parse(url) {
            XCTAssertFalse(reason.isEmpty, file: file, line: line)
        } else {
            XCTFail("debía rechazar: \(url)", file: file, line: line)
        }
    }

    // MARK: válidos

    func testCA27_1_montoYComercio() { assertOk("nido://gasto?monto=4500&comercio=Cafe%20Demo", amount: 4500, merchant: "Cafe Demo") }
    func testSoloMonto() { assertOk("nido://gasto?monto=12000", amount: 12_000, merchant: nil) }
    func testConFecha() { assertOk("nido://gasto?monto=900&comercio=Kiosco&fecha=2026-11-14", amount: 900, merchant: "Kiosco", date: "2026-11-14") }
    func testAcentosYEnie() {
        assertOk("nido://gasto?monto=3200&comercio=Panader%C3%ADa%20El%20%C3%91and%C3%BA", amount: 3200, merchant: "Panadería El Ñandú")
    }
    func testEsquemaSinMayusculasYParametrosDesconocidos() { assertOk("NIDO://gasto?monto=1000&x=1", amount: 1000, merchant: nil) }
    func testRecortaEspaciosYVacioQuedaNil() {
        assertOk("nido://gasto?monto=1000&comercio=%20%20Kiosco%20%20", amount: 1000, merchant: "Kiosco")
        assertOk("nido://gasto?monto=1000&comercio=%20%20", amount: 1000, merchant: nil)
    }
    func testComercioDeExactamente60() {
        let m = String(repeating: "a", count: 60)
        assertOk("nido://gasto?monto=1000&comercio=\(m)", amount: 1000, merchant: m)
    }
    func testFechaInexistenteOFuturaQuedaNil() {
        assertOk("nido://gasto?monto=1000&fecha=2026-02-31", amount: 1000, merchant: nil)
        assertOk("nido://gasto?monto=1000&fecha=2026-12-30", amount: 1000, merchant: nil)
        assertOk("nido://gasto?monto=1000&fecha=ma%C3%B1ana", amount: 1000, merchant: nil)
    }
    func testMontoMaximo() { assertOk("nido://gasto?monto=9999999999", amount: 9_999_999_999, merchant: nil) }

    // MARK: rechazos

    func testCA27_2_montoCero() { assertRejected("nido://gasto?monto=0") }
    func testMontoNegativo() { ["-500", "-1"].forEach { assertRejected("nido://gasto?monto=\($0)") } }
    func testMontoNoNumerico() {
        ["abc", "12abc", "1e3", "0x10", "Infinity", "NaN"].forEach { assertRejected("nido://gasto?monto=\($0)") }
    }
    func testMontoConDecimalesSeparadoresOSignos() {
        ["12.5", "1.000", "1,000", "%2B500", "%20"].forEach { assertRejected("nido://gasto?monto=\($0)") }
    }
    func testMontoVacioOAusente() {
        assertRejected("nido://gasto?monto=")
        assertRejected("nido://gasto?comercio=Kiosco")
        assertRejected("nido://gasto")
    }
    func testMontoSobreElLimite() {
        assertRejected("nido://gasto?monto=10000000000")
        assertRejected("nido://gasto?monto=99999999999999999999")
    }
    func testMontoRepetido() { assertRejected("nido://gasto?monto=100&monto=200") }
    func testEsquemasAjenos() {
        ["http://gasto?monto=1000", "https://gasto?monto=1000", "javascript:alert(1)", "nidox://gasto?monto=1000",
         "contigo://gasto?monto=1000", "intent://gasto?monto=1000", "data:text/html,<script>1</script>"]
            .forEach { assertRejected($0) }
    }
    func testAccionesQueNoSonGasto() {
        ["nido://otro?monto=1000", "nido://borrar?monto=1000", "nido://gasto/extra?monto=1000", "nido://usuario@gasto?monto=1000"]
            .forEach { assertRejected($0) }
    }
    func testComercioDemasiadoLargo() {
        assertRejected("nido://gasto?monto=1000&comercio=\(String(repeating: "a", count: 61))")
    }
    func testCaracteresDeControlEnComercio() {
        ["%00", "%0A", "%0D", "%09", "%1B", "%7F"].forEach { assertRejected("nido://gasto?monto=1000&comercio=Kiosco\($0)Demo") }
    }
    func testTextoQueNoEsEnlace() { ["", "gasto?monto=1000", "no es un enlace"].forEach { assertRejected($0) } }
}
