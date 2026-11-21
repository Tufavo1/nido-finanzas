// Copyright (c) 2026 Dinovance

/** Almacén seguro nativo (Android Keystore / iOS Keychain). Inyectable para probar. */
export interface SecureBackend {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

/** Adaptador de almacenamiento asíncrono para el `auth.storage` de supabase-js. */
export interface AsyncStorageAdapter {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

/**
 * La sesión vive solo en el almacén seguro: nunca en el almacenamiento web de la WebView.
 * Si no se puede leer, se trata como «no hay sesión» (se pedirá entrar) y se avisa a `onReadError`
 * sin el contenido. Guardar y borrar sí propagan el error: perder una sesión en silencio es peor.
 */
export function createSecureStorage(backend: SecureBackend, onReadError?: (cause: unknown) => void): AsyncStorageAdapter {
  return {
    async getItem(key) {
      try {
        return await backend.get(key)
      } catch (cause) {
        onReadError?.(cause)
        return null
      }
    },
    setItem: (key, value) => backend.set(key, value),
    removeItem: (key) => backend.remove(key),
  }
}
