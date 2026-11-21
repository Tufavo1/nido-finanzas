import XCTest
@testable import ContigoCore

// NO EJECUTADAS (requieren Xcode / un Mac).
final class PendingExpenseStoreTests: XCTestCase {
    func testTakeVaciaElBorrador() {
        let store = PendingExpenseStore()
        store.submit(ExpenseDraft(amountClp: 1000, merchant: "Kiosco", date: nil))
        XCTAssertEqual(store.take()?.amountClp, 1000)
        XCTAssertNil(store.take())
    }
    func testSubmitAvisaPorNotificacion() {
        let store = PendingExpenseStore()
        let e = expectation(forNotification: .contigoExpensePending, object: store)
        store.submit(ExpenseDraft(amountClp: 5, merchant: nil, date: nil))
        wait(for: [e], timeout: 1)
    }
}
