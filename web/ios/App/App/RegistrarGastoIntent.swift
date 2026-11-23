import AppIntents
import Foundation
import ContigoCore

/// Acción de Atajos "Registrar gasto en Contigo". Pensada para la automatización de Wallet/Apple Pay
/// ("Transacción"): recibe monto y comercio, valida igual que el enlace nido:// y abre Confirmar gasto.
/// Nada se guarda sin que la persona confirme. NO PROBADO (sin Xcode). Que Wallet entregue el monto
/// como texto y qué bancos chilenos lo soportan: NO VERIFICADO.
@available(iOS 16.0, *)
struct RegistrarGastoIntent: AppIntent {
    static var title: LocalizedStringResource = "Registrar gasto en Contigo"
    static var description = IntentDescription("Abre Contigo con el gasto listo para confirmar.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Monto", description: "Monto en pesos, por ejemplo 12990 o $12.990")
    var monto: String

    @Parameter(title: "Comercio")
    var comercio: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Registrar gasto de \(\.$monto) en \(\.$comercio)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let amount = ClpAmount.parseLenient(monto) else { throw RegistrarGastoError.montoInvalido }
        var comps = URLComponents()
        comps.scheme = ExpenseLinkParser.scheme
        comps.host = ExpenseLinkParser.action
        comps.queryItems = [URLQueryItem(name: "monto", value: String(amount))]
        if let comercio, !comercio.isEmpty { comps.queryItems?.append(URLQueryItem(name: "comercio", value: comercio)) }
        guard let url = comps.string, case .ok(let draft) = ExpenseLinkParser.parse(url) else {
            throw RegistrarGastoError.datosInvalidos
        }
        PendingExpenseStore.shared.submit(draft)
        return .result()
    }
}

@available(iOS 16.0, *)
enum RegistrarGastoError: Error, CustomLocalizedStringResourceConvertible {
    case montoInvalido, datosInvalidos

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .montoInvalido: return "El monto no es válido. Usa un número entero de pesos mayor que cero."
        case .datosInvalidos: return "No se pudo leer el gasto. Revisa el comercio."
        }
    }
}

@available(iOS 16.0, *)
struct ContigoShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RegistrarGastoIntent(),
            phrases: ["Registrar gasto en \(.applicationName)"],
            shortTitle: "Registrar gasto",
            systemImageName: "creditcard"
        )
    }
}
