import Foundation
#if canImport(Security)
import Security
#endif

public enum KeychainError: Error, Equatable {
    case invalidKey
    case valueTooLarge
    case unavailable
    case osStatus(Int32)
}

/// Almacén seguro sobre Keychain Services (equivalente iOS del Keystore de Android, DEC-03).
/// Accesible solo con el aparato desbloqueado y solo en ESTE aparato (no pasa a copias ni a iCloud).
/// Nunca registra claves ni valores.
public struct KeychainStore {
    public static let maxValueBytes = 64 * 1024
    public static let maxKeyLength = 128

    private let service: String

    public init(service: String = "cl.dinovance.contigo.secure") { self.service = service }

    #if canImport(Security)
    private func baseQuery(_ key: String? = nil) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any
        ]
        if let key { q[kSecAttrAccount as String] = key }
        return q
    }

    private func validate(_ key: String) throws {
        guard !key.isEmpty, key.count <= Self.maxKeyLength else { throw KeychainError.invalidKey }
    }

    public func set(_ value: String, forKey key: String) throws {
        try validate(key)
        let data = Data(value.utf8)
        guard data.count <= Self.maxValueBytes else { throw KeychainError.valueTooLarge }
        let update = SecItemUpdate(baseQuery(key) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { return }
        guard update == errSecItemNotFound else { throw KeychainError.osStatus(update) }
        var add = baseQuery(key)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.osStatus(status) }
    }

    public func get(_ key: String) throws -> String? {
        try validate(key)
        var q = baseQuery(key)
        q[kSecReturnData as String] = kCFBooleanTrue as Any
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw KeychainError.osStatus(status) }
        return String(data: data, encoding: .utf8)
    }

    public func remove(_ key: String) throws {
        try validate(key)
        let status = SecItemDelete(baseQuery(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError.osStatus(status) }
    }

    /// Cierre de sesión (RF-19): borra todo lo guardado por la app.
    public func clear() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError.osStatus(status) }
    }
    #else
    public func set(_ value: String, forKey key: String) throws { throw KeychainError.unavailable }
    public func get(_ key: String) throws -> String? { throw KeychainError.unavailable }
    public func remove(_ key: String) throws { throw KeychainError.unavailable }
    public func clear() throws { throw KeychainError.unavailable }
    #endif
}
