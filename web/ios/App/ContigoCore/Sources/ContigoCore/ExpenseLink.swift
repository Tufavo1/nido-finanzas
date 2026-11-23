import Foundation

public struct ExpenseDraft: Equatable {
    public let amountClp: Int64
    public let merchant: String?
    /// AAAA-MM-DD, o nil (= hoy).
    public let date: String?

    public init(amountClp: Int64, merchant: String?, date: String?) {
        self.amountClp = amountClp
        self.merchant = merchant
        self.date = date
    }
}

public enum ExpenseLinkResult: Equatable {
    case ok(ExpenseDraft)
    case rejected(String)
}

/// Valida `nido://gasto?monto=..&comercio=..&fecha=..` (RF-27). Contrato idéntico al de
/// web/src/lib/deepLink.ts. Las razones de rechazo no incluyen datos del enlace (sin montos ni comercios).
public enum ExpenseLinkParser {
    public static let scheme = "nido"
    public static let action = "gasto"
    public static let maxMerchantLength = 60

    public static func parse(_ raw: String, now: Date = Date(), calendar: Calendar = .current) -> ExpenseLinkResult {
        guard let comps = URLComponents(string: raw) else { return .rejected("No es un enlace válido.") }
        guard comps.scheme?.lowercased() == scheme else { return .rejected("Esquema no permitido.") }
        guard comps.host?.lowercased() == action, comps.path.isEmpty,
              comps.user == nil, comps.password == nil, comps.port == nil else {
            return .rejected("Acción no permitida.")
        }

        var params: [String: String] = [:]
        for item in comps.queryItems ?? [] {
            if ["monto", "comercio", "fecha"].contains(item.name) {
                guard params[item.name] == nil else { return .rejected("Parámetro repetido.") }
                params[item.name] = item.value ?? ""
            }
        }

        guard let rawAmount = params["monto"], let amount = ClpAmount.parseStrict(rawAmount) else {
            return .rejected("El monto debe ser un número entero mayor que cero.")
        }
        guard case .success(let merchant) = cleanMerchant(params["comercio"]) else {
            return .rejected("El comercio no es válido.")
        }
        return .ok(ExpenseDraft(amountClp: amount, merchant: merchant,
                                date: validPastDate(params["fecha"], now: now, calendar: calendar)))
    }

    private static func cleanMerchant(_ value: String?) -> Result<String?, ExpenseLinkError> {
        guard let value else { return .success(nil) }
        if value.unicodeScalars.contains(where: isForbidden) { return .failure(.invalid) }
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        if trimmed.count > maxMerchantLength { return .failure(.invalid) }
        return .success(trimmed.isEmpty ? nil : trimmed)
    }

    /// Controles (incluye NUL, saltos de línea, tab, ESC, DEL), separadores de línea/párrafo y
    /// caracteres de formato invisibles (p. ej. inversión de texto).
    private static func isForbidden(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.properties.generalCategory {
        case .control, .format, .lineSeparator, .paragraphSeparator: return true
        default: return false
        }
    }

    /// Como RF-02: una fecha inexistente, mal formada o futura se descarta (queda "hoy"), no rechaza el enlace.
    private static func validPastDate(_ value: String?, now: Date, calendar: Calendar) -> String? {
        guard let value, value.count == 10 else { return nil }
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
              parts.allSatisfy({ $0.unicodeScalars.allSatisfy { $0.value >= 0x30 && $0.value <= 0x39 } }),
              let date = calendar.date(from: DateComponents(year: y, month: m, day: d)) else { return nil }
        let back = calendar.dateComponents([.year, .month, .day], from: date)
        guard back.year == y, back.month == m, back.day == d else { return nil }
        guard date <= calendar.startOfDay(for: now) else { return nil }
        return value
    }
}

private enum ExpenseLinkError: Error { case invalid }
