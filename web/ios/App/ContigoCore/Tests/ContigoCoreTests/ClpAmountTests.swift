import XCTest
@testable import ContigoCore

// NO EJECUTADAS (requieren Xcode / un Mac). Importes del Atajo de Apple Pay, mismos casos
// que native/parser/src/test/resources/fixtures.json que aplican a un importe suelto
// (F01-F03, F14-F17, E06, E08). Todos sintéticos.
final class ClpAmountTests: XCTestCase {
    func testConSimboloYPuntos() {            // F01
        XCTAssertEqual(ClpAmount.parseLenient("$12.990"), 12_990)
    }
    func testPrefijoCLP() {                   // F02
        XCTAssertEqual(ClpAmount.parseLenient("CLP 4500"), 4500)
    }
    func testSufijoPesos() {                  // F03
        XCTAssertEqual(ClpAmount.parseLenient("8.500 pesos"), 8500)
    }
    func testDolaresSeRechazan() {            // F14
        XCTAssertNil(ClpAmount.parseLenient("US$ 12.00"))
    }
    func testDecimalesSeTruncan() {           // F15
        XCTAssertEqual(ClpAmount.parseLenient("$1.234,50"), 1234)
    }
    func testMillones() {                     // F16
        XCTAssertEqual(ClpAmount.parseLenient("$1.250.000"), 1_250_000)
    }
    func testSinSeparadores() {               // F17
        XCTAssertEqual(ClpAmount.parseLenient("99999"), 99_999)
    }
    func testEspacioTrasSimbolo() {           // E06
        XCTAssertEqual(ClpAmount.parseLenient("$ 1.500"), 1500)
    }
    func testSoloPesosSinSimbolo() {          // E08
        XCTAssertEqual(ClpAmount.parseLenient("12500 pesos"), 12_500)
    }
    func testRechazos() {
        ["", "0", "$0", "-500", "abc", "1e3", "12.5", "1,000", "1.00.0", "$", "12.99", "99999999999"]
            .forEach { XCTAssertNil(ClpAmount.parseLenient($0), $0) }
    }
    func testEstrictoSoloDigitos() {
        XCTAssertEqual(ClpAmount.parseStrict("4500"), 4500)
        XCTAssertEqual(ClpAmount.parseStrict("9999999999"), 9_999_999_999)
        ["0", "-1", "+5", "1.000", "1,5", " 5", "", "10000000000"].forEach { XCTAssertNil(ClpAmount.parseStrict($0), $0) }
    }
}
