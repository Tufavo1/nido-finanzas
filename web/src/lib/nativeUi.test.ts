// Copyright (c) 2026 Dinovance
/// <reference types="node" />
// En la app nativa no puede aparecer nada de PWA: los componentes web se protegen con isNativeApp().
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('guardas de la app nativa', () => {
  it.each(['../components/InstallBanner.tsx', '../components/InstallGuide.tsx'])('%s no se dibuja en nativo', (f) => {
    expect(src(f)).toMatch(/if \(isNativeApp\(\)\) return null/)
  })
  it('main.tsx no arranca vigilantes de PWA en nativo', () => {
    const t = src('../main.tsx')
    expect(t).toMatch(/if \(!isNativeApp\(\)\) startInstallWatcher\(\)/)
    expect(t).toMatch(/if \(!isNativeApp\(\)\) startUpdateWatcher\(\)/)
  })
  it('Ajustes oculta «Cómo instalar» en nativo', () => expect(src('../screens/Security.tsx')).toMatch(/\{!native && \(\s*<SettingsItem[^>]*id="install"/s))
  it('el aviso de notificaciones en nativo no habla de Web Push', () => {
    expect(src('../components/NativePushToggle.tsx')).not.toMatch(/Notification\.|serviceWorker|VAPID|navegador|PushManager/)
  })
})
