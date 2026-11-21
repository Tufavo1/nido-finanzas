import Foundation

/// Importes en pesos chilenos (enteros, sin decimales).
public enum ClpAmount {
    /// Tope compatible con la columna de la base (RF-02 / RF-27): 9.999.999.999.
    public static let max: Int64 = 9_999_999_999
    private static let maxDigits = 10

    /// Solo dígitos ASCII, mayor que cero y no mayor que `max`. Es lo que acepta el enlace `nido://`.
    public static func parseStrict(_ text: String) -> Int64? {
        guard !text.isEmpty, text.count <= maxDigits,
              text.unicodeScalars.allSatisfy({ $0.value >= 0x30 && $0.value <= 0x39 }),
              let value = Int64(text), value > 0, value <= max else { return nil }
        return value
    }

    /// Texto de un Atajo ("$12.990", "CLP 4500", "8.500 pesos", "$1.234,50"). Puntos de miles y
    /// coma decimal chilenos; los decimales se truncan. Rechaza dólares, signos, notación científica
    /// y cualquier forma ambigua ("12.5", "1,000").
    public static func parseLenient(_ text: String) -> Int64? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        for prefix in ["CLP", "$"] where s.hasPrefix(prefix) { s.removeFirst(prefix.count); break }
        s = s.trimmingCharacters(in: .whitespaces)
        for suffix in ["PESOS", "CLP"] where s.hasSuffix(suffix) { s.removeLast(suffix.count); break }
        s = s.trimmingCharacters(in: .whitespaces)

        let parts = s.split(separator: ",", maxSplits: 2, omittingEmptySubsequences: false).map(String.init)
        guard parts.count <= 2, let integerPart = parts.first, !integerPart.isEmpty else { return nil }
        if parts.count == 2 {
            let decimals = parts[1]
            guard (1...2).contains(decimals.count), isAsciiDigits(decimals) else { return nil }
        }
        guard let digits = stripThousands(integerPart) else { return nil }
        return parseStrict(digits)
    }

    private static func stripThousands(_ s: String) -> String? {
        let groups = s.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard groups.allSatisfy(isAsciiDigits) else { return nil }
        if groups.count == 1 { return groups[0] }
        guard (1...3).contains(groups[0].count), groups.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
        return groups.joined()
    }

    private static func isAsciiDigits(_ s: String) -> Bool {
        !s.isEmpty && s.unicodeScalars.allSatisfy { $0.value >= 0x30 && $0.value <= 0x39 }
    }
}
