import XCTest
@testable import ContigoCore

// NO EJECUTADAS (requieren Xcode / un Mac). Usan un servicio propio de pruebas.
final class KeychainStoreTests: XCTestCase {
    private let store = KeychainStore(service: "cl.dinovance.contigo.tests")

    override func setUp() { try? store.clear() }
    override func tearDown() { try? store.clear() }

    func testGuardaYLee() throws {
        try store.set("valor-de-prueba", forKey: "k1")
        XCTAssertEqual(try store.get("k1"), "valor-de-prueba")
    }
    func testSobrescribe() throws {
        try store.set("a", forKey: "k1")
        try store.set("b", forKey: "k1")
        XCTAssertEqual(try store.get("k1"), "b")
    }
    func testClaveAusenteDevuelveNil() { XCTAssertNil(try store.get("no-existe")) }
    func testBorraUnaClave() throws {
        try store.set("a", forKey: "k1")
        try store.remove("k1")
        XCTAssertNil(try store.get("k1"))
    }
    func testClearBorraTodo() throws {
        try store.set("a", forKey: "k1")
        try store.set("b", forKey: "k2")
        try store.clear()
        XCTAssertNil(try store.get("k1"))
        XCTAssertNil(try store.get("k2"))
    }
    func testRechazaClaveInvalida() {
        XCTAssertThrowsError(try store.set("x", forKey: ""))
        XCTAssertThrowsError(try store.set("x", forKey: String(repeating: "k", count: 129)))
    }
    func testRechazaValorGigante() {
        XCTAssertThrowsError(try store.set(String(repeating: "x", count: KeychainStore.maxValueBytes + 1), forKey: "k"))
    }
}
