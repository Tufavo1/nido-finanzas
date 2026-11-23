// Copyright (c) 2026 Dinovance
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.dinovance.contigo',
  appName: 'Contigo',
  webDir: 'dist',
  // Sin registros nativos de Capacitor: nada de URL ni cuerpos de peticiones en logcat (NFR-01).
  loggingBehavior: 'none',
  android: {
    // Sin contenido mixto ni depuración de la WebView en el APK.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
