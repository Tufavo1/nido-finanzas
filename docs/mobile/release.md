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
1. **Parche S-01: YA NO es necesario.** La app nativa manda el `Origin` del Worker (derivado de `VITE_API_BASE`) en todas sus peticiones, así que `isSameSite` del Worker se queda como está. No aplique `worker-S01-sin-origin.patch` ni la sección Worker de `endurecimiento-android-worker.patch` (ambos OBSOLETOS).
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

## 8. Entrar con Google en la app (lo que debe hacer el DUEÑO fuera del código)
Google bloquea el OAuth web dentro de una WebView (`disallowed_useragent`). La app nativa NUNCA lo abre: usa Credential Manager + Sign in with Google (selector de cuentas del sistema). El botón solo se muestra si el APK se compiló con `VITE_GOOGLE_CLIENT_ID` y el teléfono tiene Google Play Services.

1. **Google Cloud Console** (mismo proyecto del cliente web): APIs y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth, tipo **Android**:
   - Nombre del paquete: `cl.dinovance.contigo`
   - Huella SHA-1 del certificado de firma de RELEASE: `2F:75:6D:E0:CF:04:79:42:23:22:2B:DF:4D:58:DA:32:D4:C4:9A:24` (comprobada con `apksigner verify --print-certs dist-apk/nido-release.apk`, línea «SHA-1 digest»).
   - Si algún día se firma con otra llave (o Play App Signing), crear otro cliente Android con esa SHA-1. El ID del cliente Android NO se pone en el código: Google identifica la app por paquete + SHA-1.
   - La pantalla de consentimiento debe estar publicada (o con la cuenta de prueba agregada).
2. **Supabase** (panel): Authentication > Providers > Google:
   - **Enable Sign in with Google**: activado.
   - **Client IDs** (autorizados): `305556491325-k77oi3118v74tmfogrnafln4frq40mqp.apps.googleusercontent.com` (el ID de cliente WEB; es el `serverClientId`, el `aud` del token). Si hay más de uno, separados por coma. No hace falta poner el ID del cliente Android.
   - **Skip nonce checks**: DESACTIVADO (la app envía el SHA-256 del nonce a Google y el nonce en claro a Supabase, que lo comprueba).
   - **Allow users without an email**: desactivado.
   - El Client Secret solo lo usa el flujo web (PWA); la app nativa no lo necesita.
3. **Captcha:** `signInWithGoogleToken` ya manda `captchaToken` (Turnstile) a `signInWithIdToken`, igual que la web. Si en Authentication > Attack Protection el captcha está activo y la WebView no puede resolver Turnstile, el inicio de sesión mostrará «No pudimos verificar que no eres un robot». NO verificado en teléfono; si falla, evalúe permitir ID tokens sin captcha en ese proyecto o dejar solo correo y contraseña.
4. **MFA:** tras entrar con Google el flujo de segundo factor existente se aplica igual (misma sesión de Supabase en el Keystore).
Mensajes de error (en español simple): cancelado, sin cuentas de Google, sin conexión, nonce inválido, teléfono sin soporte, el servidor no validó la cuenta. Nunca se registran tokens ni correos.
