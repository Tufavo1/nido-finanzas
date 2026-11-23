import Foundation

public extension Notification.Name {
    /// Se publica cuando hay un gasto validado esperando (desde un enlace o desde el Atajo).
    static let contigoExpensePending = Notification.Name("cl.dinovance.contigo.expensePending")
}

/// Guarda en MEMORIA (nunca en disco) el borrador validado hasta que la pantalla lo consume.
public final class PendingExpenseStore {
    public static let shared = PendingExpenseStore()
    private let lock = NSLock()
    private var draft: ExpenseDraft?

    public init() {}

    public func submit(_ newDraft: ExpenseDraft) {
        lock.lock(); draft = newDraft; lock.unlock()
        NotificationCenter.default.post(name: .contigoExpensePending, object: self)
    }

    public func take() -> ExpenseDraft? {
        lock.lock(); defer { lock.unlock() }
        let current = draft
        draft = nil
        return current
    }
}
