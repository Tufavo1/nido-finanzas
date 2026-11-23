// Copyright (c) 2026 Dinovance
// Qué muestra el banner de actualización según el estado. Lógica pura.
import type { UpdateState } from './appUpdateStore'

export type BannerView =
  | { kind: 'hidden' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number | null }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; version: string; text: string; permission: boolean }

export function bannerView(u: Pick<UpdateState, 'phase' | 'info' | 'percent' | 'error' | 'dismissed' | 'suppressed'>, native: boolean): BannerView {
  if (!native || !u.info.available) return { kind: 'hidden' }
  const version = u.info.versionName ?? ''
  // Trabajando (descargando o abriendo el instalador): siempre visible, aunque se haya dicho «Después»
  if (u.phase === 'downloading') return { kind: 'downloading', version, percent: u.percent }
  if (u.phase === 'installing') return { kind: 'ready', version }
  if (u.dismissed) return { kind: 'hidden' }
  // La hoja del primer aviso y «Conectar bancos» van primero: el banner no se superpone
  if (u.phase === 'prompt' || u.suppressed) return { kind: 'hidden' }
  if (u.phase === 'error' && u.error) return { kind: 'error', version, text: u.error.short, permission: u.error.kind === 'permission' }
  if (u.phase === 'checking' || u.phase === 'uptodate') return { kind: 'hidden' }
  return { kind: 'available', version }
}
