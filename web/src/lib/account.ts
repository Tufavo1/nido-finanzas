import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * ¿Esta cuenta tiene contraseña en la app? Entra por correo (proveedor «email») o la creó después de entrar con Google
 * (se anota en `has_password`, porque crear una contraseña no agrega «email» a la lista de proveedores).
 */
export function hasPassword(user: Pick<User, 'app_metadata' | 'user_metadata'> | null | undefined): boolean {
  if (!user) return false
  const providers = Array.isArray(user.app_metadata?.providers) ? (user.app_metadata.providers as string[]) : []
  if (providers.includes('email')) return true
  // Cuentas antiguas: solo el campo «provider»
  if (user.app_metadata?.provider === 'email') return true
  return user.user_metadata?.has_password === true
}

/** ¿Entró con Google? */
export function usesGoogle(user: Pick<User, 'app_metadata'> | null | undefined): boolean {
  const providers = Array.isArray(user?.app_metadata?.providers) ? (user!.app_metadata.providers as string[]) : []
  return providers.includes('google') || user?.app_metadata?.provider === 'google'
}

export interface AccountInfo {
  loading: boolean
  /** Verdadero mientras no se sepa: así nunca se le oculta a nadie lo que sí tiene */
  hasPassword: boolean
  google: boolean
  email: string | null
}

/** Datos de acceso de la persona; se actualizan solos cuando crea o cambia su contraseña */
export function useAccount(): AccountInfo {
  const [info, setInfo] = useState<AccountInfo>({ loading: true, hasPassword: true, google: false, email: null })
  useEffect(() => {
    let alive = true
    const read = () =>
      void supabase.auth.getUser().then(({ data }) => {
        if (!alive) return
        setInfo({ loading: false, hasPassword: data.user ? hasPassword(data.user) : true, google: usesGoogle(data.user), email: data.user?.email ?? null })
      })
    read()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED') read()
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])
  return info
}
