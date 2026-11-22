<!-- Copyright (c) 2026 Dinovance -->
# Release del APK de Contigo (Android)

Todo local. Nada de esto toca producción: el Worker y el Release de GitHub los hace el dueño.

## 1. Qué hay y cómo se compila
- `dist-apk/nido-release.apk` (+ `.sha256`): firmado, R8 activo, `debuggable` ausente, `minSdk 26`, `targetSdk 36`. Permisos: INTERNET, POST_NOTIFICATIONS, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, `c2dm.RECEIVE` y el permiso propio `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
- `dist-apk/nido-debug.apk`: SOLO desarrollo (debuggable, llave pública de depuración). No repartir.
- Compilar: `ALLOW_LOCAL_BUILD=1 bash scripts/docker-android-build.sh release` (monta `~/.nido-signing` en `/signing`, solo lectura). Sin llave, Gradle aborta: nunca deja un APK sin firmar.
- `VITE_API_BASE` (S-07): es variable de COMPILACIÓN y la pasa el dueño, p. ej. `VITE_API_BASE=https://<su-dominio>/supabase ALLOW_LOCAL_BUILD=1 bash scripts/docker-android-build.sh release`. En producción la app rechaza una URL que no sea `https:`. Vacía, la app apunta a `https://localhost/supabase` y no puede iniciar sesión: **los APK de `dist-apk/` actuales se compilaron sin ella**, hay que recompilar con la URL real antes de repartir. Los enlaces de correo y OAuth (`redirectTo` en nativo) siguen pendientes de diseño (S-07 de `seguridad.md`).
- Versión: subir `versionCode` y `versionName` en `web/android/app/build.gradle` en cada release (Android no instala un `versionCode` menor o igual encima).
- CSP en el WebView (S-06): NO aplicada. Capacitor inyecta su puente como script en línea; una CSP estricta puede romperlo y no hay teléfono para probarlo. Pendiente de prueba en dispositivo.

## 2. Verificar el APK antes de repartir
```bash
AS=$(find ~/Android/Sdk/build-tools -name apksigner | sort | tail -1); AAPT=$(find ~/Android/Sdk/build-tools -name aapt2 | sort | tail -1)
$AS verify --verbose --print-certs dist-apk/nido-release.apk   # Verifies; DN debe ser CN=Contigo, no «Android Debug»
$AAPT dump xmltree --file AndroidManifest.xml dist-apk/nido-release.apk | grep -c debuggable   # 0
(cd dist-apk && sha256sum -c nido-release.apk.sha256)
```
Huella SHA-256 del certificado de esta llave: `41:1E:94:AC:69:94:77:B6:A3:06:18:FC:48:E6:B9:B3:2E:4D:54:F1:37:10:8F:27:AF:98:07:EF:E1:A8:65:B6`. Publíquela junto al APK.

## 3. La llave de firma
- Está en `~/.nido-signing/` (carpeta 700): `nido-release.jks` (PKCS12, RSA 4096, alias `nido`, validez 30 años) y `keystore.properties` (ambos 600, contraseña aleatoria). Nunca va al repo (`.gitignore` ya la cubre) ni se imprime.
- **Respaldo (obligatorio):** si se pierde, no se puede actualizar la app instalada (habría que desinstalar y perder los datos locales). Copie la carpeta COMPLETA a dos lugares fuera de este equipo, cifrada: `tar -C ~ -czf - .nido-signing | gpg --symmetric --cipher-algo AES256 -o nido-signing.tar.gz.gpg` (guarde la frase en un gestor de contraseñas, no junto al archivo). Compruebe la restauración una vez.
- Rotarla implica un APK nuevo que no se instala sobre el anterior.

## 4. Instalar en el teléfono
1. Pase `nido-release.apk` por un canal que permita comprobar el `sha256` (calcúlelo en el teléfono o compare la huella del certificado).
2. Ajustes > Seguridad > Instalar apps desconocidas: permitir al explorador o app desde donde lo abre. Instale.
3. Android 13+: al instalar fuera de Play Store el sistema bloquea el acceso a notificaciones. Ajustes > Apps > Contigo > menú de tres puntos > **Permitir ajustes restringidos**.
4. Ajustes > Notificaciones > Acceso a notificaciones > activar Contigo (la app tiene una guía). También permita las notificaciones propias.
5. Fabricantes agresivos (Xiaomi, Huawei, Samsung): quite la optimización de batería para Contigo, o el servicio se detiene.
6. La app no permite capturas de pantalla (FLAG_SECURE): es intencional.

## 5. Lo que debe aplicar el dueño en el Worker (yo NO lo toqué)
1. **Parche S-01** (`docs/mobile/seguridad/parches/endurecimiento-android-worker.patch`, solo la sección `web/worker/proxy.ts`): sin él la app nativa recibe 403 en toda escritura (incluido el login), porque `isSameSite` exige `Origin`. El parche acepta la escritura solo si faltan AMBOS `Origin` y `Sec-Fetch-Site`. Revíselo y aplíquelo con `git apply --include='web/worker/*'`. Las secciones de Android del mismo parche YA están aplicadas.
2. **`wrangler` observability:** `docs/mobile/patches/wrangler-observability.patch` (registros del Worker sin cuerpos ni datos personales).
3. Revisar que el límite de tasa por IP del Worker aguante el tráfico de varias apps desde la misma red móvil.
4. Migraciones nuevas para la base (staging probadas; en producción las aplica el dueño en orden): `20261121160000`, `20261121170000_seguridad_endurece_observabilidad`, `20261121180000_ingesta_detalle_numerico`, `20261122100000_alerta_gasto_mayor`. Orden para el aviso de gasto mayor: (1) aplicar la migración `20261122100000_alerta_gasto_mayor.sql`; (2) desplegar la función `notify` (`recipients.ts` + `index.ts`); (3) publicar la app. Con la función nueva y sin migración todos reciben el aviso normal. Programar `select public.purge_observability(90)` (pg_cron o tarea) para que la retención de `client_errors` y `security_events` funcione: la función existe pero nada la llama.

## 6. Crear el Release en BORRADOR (lo ejecuta el dueño)
```bash
cd dist-apk && sha256sum -c nido-release.apk.sha256
gh release create v1.0 --draft --title "Contigo 1.0 (Android)" \
  --notes "Instalar: ver docs/mobile/release.md. Huella del certificado SHA-256: 41:1E:94:AC:69:94:77:B6:A3:06:18:FC:48:E6:B9:B3:2E:4D:54:F1:37:10:8F:27:AF:98:07:EF:E1:A8:65:B6" \
  nido-release.apk nido-release.apk.sha256
# Revise el borrador en GitHub; publíquelo con: gh release edit v1.0 --draft=false
```
No suba `nido-debug.apk`. Verifique `VITE_API_BASE` antes (punto 1).

## 7. Lo no verificado
Instalación y arranque del release en un teléfono real (R8 con Capacitor/plugin: se comprobó que el dex conserva `ContigoNativePlugin`, no que el puente funcione), `FLAG_SECURE`, el servicio de notificaciones, login contra el Worker real, CSP nativa, FCM.
