import Foundation
import Capacitor
import ContigoCore

/// Plugin Capacitor "ContigoNative" (iOS). Equivale al plugin Android del mismo nombre.
/// - Almacén seguro en Keychain (secureGet/secureSet/secureRemove/secureClear).
/// - Enlace profundo nido://gasto y Atajo "Registrar gasto en Contigo": ambos pasan por la
///   misma validación (ExpenseLinkParser) y llegan a JS como el evento "expenseLink" (o con takePendingExpense).
/// NO PROBADO: no se pudo compilar ni ejecutar (sin Xcode).
@objc(ContigoPlugin)
public class ContigoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ContigoPlugin"
    public let jsName = "ContigoNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureClear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "validateExpenseLink", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingExpense", returnType: CAPPluginReturnPromise)
    ]

    private let keychain = KeychainStore()
    private var observers: [NSObjectProtocol] = []

    public override func load() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: .capacitorOpenURL, object: nil, queue: .main) { [weak self] note in
            guard let url = (note.object as? [String: Any])?["url"] as? URL else { return }
            self?.handleOpened(url)
        })
        observers.append(center.addObserver(forName: .contigoExpensePending, object: nil, queue: .main) { [weak self] _ in
            self?.emitPending()
        })
        emitPending() // por si el Atajo llegó antes de que el plugin cargara
    }

    deinit { observers.forEach(NotificationCenter.default.removeObserver) }

    // MARK: enlaces

    private func handleOpened(_ url: URL) {
        // Solo el esquema propio; los demás enlaces se ignoran aquí.
        guard url.scheme?.lowercased() == ExpenseLinkParser.scheme else { return }
        switch ExpenseLinkParser.parse(url.absoluteString) {
        case .ok(let draft): PendingExpenseStore.shared.submit(draft)
        case .rejected(let reason): notifyListeners("expenseLinkRejected", data: ["reason": reason])
        }
    }

    private func emitPending() {
        guard let draft = PendingExpenseStore.shared.take() else { return }
        notifyListeners("expenseLink", data: Self.payload(draft), retainUntilConsumed: true)
    }

    private static func payload(_ d: ExpenseDraft) -> [String: Any] {
        var out: [String: Any] = ["amountClp": d.amountClp]
        if let m = d.merchant { out["merchant"] = m }
        if let date = d.date { out["date"] = date }
        return out
    }

    @objc func validateExpenseLink(_ call: CAPPluginCall) {
        guard let url = call.getString("url") else { return call.reject("Falta el enlace.") }
        switch ExpenseLinkParser.parse(url) {
        case .ok(let d):
            var out = Self.payload(d)
            out["ok"] = true
            call.resolve(out)
        case .rejected(let reason): call.resolve(["ok": false, "reason": reason])
        }
    }

    @objc func takePendingExpense(_ call: CAPPluginCall) {
        call.resolve(PendingExpenseStore.shared.take().map(Self.payload) ?? [:])
    }

    // MARK: Keychain

    @objc func secureGet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("Falta la clave.") }
        run(call) { call.resolve(try self.keychain.get(key).map { ["value": $0] } ?? [:]) }
    }

    @objc func secureSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else { return call.reject("Faltan datos.") }
        run(call) { try self.keychain.set(value, forKey: key); call.resolve() }
    }

    @objc func secureRemove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("Falta la clave.") }
        run(call) { try self.keychain.remove(key); call.resolve() }
    }

    @objc func secureClear(_ call: CAPPluginCall) {
        run(call) { try self.keychain.clear(); call.resolve() }
    }

    /// Los mensajes de error no incluyen ni claves ni valores.
    private func run(_ call: CAPPluginCall, _ body: () throws -> Void) {
        do { try body() } catch let e as KeychainError {
            call.reject("Almacén seguro: \(e)")
        } catch { call.reject("Almacén seguro: error inesperado.") }
    }
}
