<!-- Copyright (c) 2026 Dinovance -->
# Play Protect y el APK de Contigo (instalado fuera de Google Play)

## La verdad primero

**Ningún cambio en el código garantiza que Play Protect deje de advertir.** Play Protect decide con la reputación que Google tiene de la app y de su firma (cuántos teléfonos la instalaron, desde cuándo, si alguien la denunció) y con su propio análisis (estático y en la nube). Esos criterios no son públicos y cambian. Lo que sí depende de nosotros es no parecer malware y no darle motivos reales. Eso es lo que se hizo en la ronda 5. El resto depende del dueño (cuenta de desarrollador, publicación, constancia en la firma).

## Por qué advierte hoy

1. **La app es nueva y no tiene reputación.** Es un paquete (`cl.dinovance.contigo`) y una firma que Google casi no ha visto. Para Play Protect, «desconocida» ya es motivo para avisar.
2. **La combinación de permisos es el perfil típico de un troyano bancario:**
   - un **listener de notificaciones** (puede leer los avisos de los bancos, incluidos códigos),
   - **`REQUEST_INSTALL_PACKAGES`** (puede instalar otros APK),
   - **`INTERNET`** (puede mandar datos fuera).

   Una app legítima puede tener las tres cosas (Contigo lo hace por razones reales: leer el aviso del banco, actualizarse sola y sincronizar), pero el clasificador ve el mismo patrón que el malware.
3. **Se instala fuera de Play** (desde el navegador, GitHub o un archivo). En Android 13 o superior, además, el sistema bloquea los «ajustes restringidos» (acceso a notificaciones) de las apps instaladas así hasta que la persona los permita a mano. Esto es del sistema, no de Play Protect, y la guía de la app ya lo explica.
4. **Programas regionales de Google.** En algunos países Google bloquea por completo instalar desde internet una app que pide acceso a notificaciones o a SMS («protección mejorada contra fraude», empezó en Singapur y se amplió a otros países). Hasta donde sé, **Chile no estaba en esa lista**. Revísalo en la ayuda oficial de Google Play Protect porque cambia. Google también anunció que los teléfonos certificados van a exigir un **desarrollador verificado** incluso para apps instaladas fuera de Play (por etapas desde 2026, según su anuncio de 2025). Busca «Android developer verification» en la documentación oficial de Android y revisa las fechas y los países actuales.

## Qué hicimos para bajar las señales que dependen de nosotros (ronda 5)

| Señal | Estado | Cómo se comprueba |
|---|---|---|
| Permisos mínimos: se quitó `FOREGROUND_SERVICE` (lo traía WorkManager sin uso). No hay SMS, llamadas, contactos, ubicación, cámara, micrófono, accesibilidad, superposición ni administrador de dispositivo, tampoco `QUERY_ALL_PACKAGES` ni `AD_ID` | Hecho | `ManifestSecurityTest` (manifiesto fusionado), `scripts/verify-apk-security.sh` (APK) |
| El listener declara su propósito y pide menos: por defecto solo avisos normales y silenciosos, no conversaciones de mensajería, y nunca notificaciones persistentes (`default_filter_types`/`disabled_filter_types`, Android 12+). Su etiqueta en Ajustes es «Contigo: detectar gastos» | Hecho | idem |
| Nombre coherente: etiqueta «Contigo», paquete `cl.dinovance.contigo`, ícono propio | Ya estaba; ahora se prueba | idem |
| `targetSdk` 36 (el actual), `compileSdk` 36 | Ya estaba; la prueba exige al menos 35 | idem |
| Firma v2 + **v3** con la llave propia (RSA 4096, `CN=Contigo, O=Dinovance`) | v3 activada en `build.gradle`; **hay que recompilar** | `apksigner verify --print-certs` / script |
| No depurable, R8 activo, sin mapas de código, sin logs de librerías en release | Hecho | script |
| Sin publicidad ni analítica; sin carga dinámica de código propia | Comprobado | script (busca SDK conocidos y cargadores en el dex) |
| Actualizador interno: se mantiene (decisión del dueño) **sin debilitarlo**: solo GitHub por https con hosts exactos, SHA-256, mismo paquete, `versionCode` mayor y **misma firma** antes de pedir instalar | Comprobado por lectura y pruebas (`UpdateCoreTest`) | `seguridad.md` Ronda 5 |
| Política de privacidad publicada en `https://contigo.dinovance.cl/privacidad.html` y empaquetada en la app (`privacidad.html`): explica el acceso a notificaciones, Firebase y las actualizaciones desde GitHub | Ya estaba (no la contacté: la revisé en el repo) | `web/public/privacidad.html` |

Lo que **no** se puede quitar sin perder funciones: el listener (es la función principal), `REQUEST_INSTALL_PACKAGES` (actualizador; el dueño decidió mantenerlo) e `INTERNET`. Esa combinación seguirá llamando la atención mientras la app no tenga reputación.

## Caminos reales (dependen del dueño)

**(a) Instalar a pesar del aviso (cada persona).** Si Play Protect muestra «App no segura» o «App dañina bloqueada», normalmente hay un enlace **«Más detalles»** con la opción **«Instalar de todos modos»**. Si ofrece **«Enviar app para análisis»**, conviene aceptar (ayuda a que Google la conozca). En algunos casos aparece «Instalar sin analizar». Si la marca como **dañina** y no da opción, no insistas: pasa a (b). No le pidas a nadie que desactive Play Protect.

**(b) Pedir revisión como desarrollador.** Google tiene un formulario para que un desarrollador apele una advertencia de Play Protect sobre su app. Busca en la ayuda oficial de Google Play Protect o de Play Console la página de **«Play Protect appeals»** o «apelar una advertencia de Play Protect» (no pongo la dirección porque no la pude verificar sin red: entra solo desde `support.google.com` o `developers.google.com`). En general piden: el nombre del paquete (`cl.dinovance.contigo`), el APK o un enlace de descarga, la huella SHA-256 del certificado de firma, una explicación de por qué se usa cada permiso sensible (puedes copiar la tabla de permisos de `seguridad.md`, Ronda 5) y un contacto. Explica en simple que el listener solo procesa avisos de bancos que la persona elige, que todo se revisa en el teléfono, y que `REQUEST_INSTALL_PACKAGES` solo instala actualizaciones de la misma app firmadas con la misma llave.

**(c) Publicar en Google Play (la solución de fondo).** Con una prueba **interna** o **cerrada** en Play Console, la app se instala desde Play, gana reputación y Play Protect deja de tratarla como desconocida. Ojo con estas reglas de Play:
- La declaración del acceso a notificaciones (se justifica bien: es la función principal).
- La política de **`REQUEST_INSTALL_PACKAGES`**: Play **no permite** que una app publicada en Play se actualice sola desde fuera de Play. Para esa versión habría que quitar el actualizador (un «sabor» de compilación sin ese permiso).
- Play App Signing: Google firma lo que se distribuye por Play. Si el dueño quiere que la versión de GitHub y la de Play se actualicen entre sí, hay que decidirlo **antes** de la primera subida (subir la misma llave o aceptar que son instalaciones separadas).

**(d) Mantener SIEMPRE la misma llave y subir el `versionCode`.** La reputación se acumula sobre la firma y el paquete. Una llave nueva equivale a una app nueva: se pierde la reputación, y además **las personas que ya la tienen no pueden actualizar** (Android rechaza otra firma). Respalda `~/.nido-signing/` cifrado y fuera del equipo. Cada release debe tener un `versionCode` mayor (sale de `web/package.json`).

**(e) No cambiar el paquete** (`cl.dinovance.contigo`). Cambiarlo también reinicia la reputación y deja sin actualización a quienes ya la instalaron.

## Checklist antes de cada release (verificable)

1. `web/package.json` con una versión mayor que la anterior (`versionCode = major*10000 + minor*100 + patch`).
2. Pruebas en verde: `gradle -p native/core jvmTest --offline -q`, `cd web/android && gradle :app:testDebugUnitTest --offline -q` (incluye `ManifestSecurityTest`), `cd web && npx vitest run`.
3. Compilar el release con la llave de siempre (`docs/mobile/release.md`) y `VITE_API_BASE=https://…`.
4. `NIDO_CERT_SHA256=<huella de siempre> bash scripts/verify-apk-security.sh dist-apk/nido-release.apk` debe terminar con `RESUMEN falla=0`. La huella del certificado actual es `411e94ac699477b6a30618fc48e6b9b32e4d54f137108f27af9807efe1a865b6` (leída del 1.2.12 con `apksigner`). **Si cambia, no publiques.** Los AVISO que quedan hoy son la CSP nativa (S-06/R5-04, parche propuesto) y `DynamiteModule` de Google.
5. Comprobar a mano en la salida: `permisos exactos` son los 9 de `scripts/apk-security-policy.txt`, `firma v2` y `firma v3` presentes, `no depurable`, `targetSdk` ≥ 35.
6. Publicar en el release de GitHub `nido-release.apk` y `nido-release.apk.sha256` (los dos nombres exactos que espera el actualizador); en las notas, poner también la huella del certificado.
7. Instalar el APK nuevo **encima** del anterior en un teléfono real (no desinstalar antes): debe actualizar sin pedir borrar datos. Probar entrar, un gasto, el acceso a notificaciones y «Buscar actualización».
8. Si Play Protect lo marca, usar (a) en tu teléfono y (b) con el formulario oficial; anotar la fecha y la versión para hacer seguimiento.
