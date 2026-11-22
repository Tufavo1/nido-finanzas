// Copyright (c) 2026 Dinovance
import { useEffect } from 'react'
import { buildAutoProfile, syncApiBase } from './autoSync'
import { ContigoNative, isNativeApp, ownerKeyOf } from './nativeBridge'
import { currentGeneration, enqueueNative } from './nativeSerial'
import { logError } from './safeLog'

interface Args {
  userId: string
  householdId: string
  shared: boolean
  categories: { id: string; name: string }[]
  history: { note: string | null; category_id: string }[]
  ready: boolean
}

/**
 * Deja listo al teléfono para guardar y enviar solo con la app cerrada: dirección del servidor, dueño activo y perfil
 * (categorías aprendidas). Se repite al cambiar de cuenta u hogar o cuando cambia el historial. Sin perfil no se guarda nada solo.
 */
export function useAutoSync({ userId, householdId, shared, categories, history, ready }: Args): void {
  useEffect(() => {
    if (!isNativeApp()) return
    ContigoNative.configureSync({ apiBase: syncApiBase(import.meta.env.VITE_API_BASE) }).catch((e: unknown) => logError(e, 'useAutoSync'))
  }, [])

  useEffect(() => {
    if (!isNativeApp() || !ready) return
    const key = ownerKeyOf(userId, householdId)
    const profile = buildAutoProfile({ userId, householdId, shared, categories, history })
    let cancelled = false
    const t = window.setTimeout(() => {
      // Cola serial: el dueño se fija primero y el perfil solo se envía si nadie borró o cambió de cuenta entre tanto
      const gen = currentGeneration()
      const stale = (): boolean => cancelled || gen !== currentGeneration()
      void enqueueNative(async () => {
        if (stale()) return
        await ContigoNative.setActiveOwner({ ownerKey: key })
        if (stale()) return
        await ContigoNative.setAutoProfile(profile)
      }).catch((e: unknown) => logError(e, 'useAutoSync'))
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [userId, householdId, shared, categories, history, ready])
}
