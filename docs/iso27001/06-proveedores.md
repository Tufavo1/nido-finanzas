# Registro de proveedores y servicios en la nube

> Versión 1.0 · 2026-11-02. Revisión anual (5.19–5.23). **Las certificaciones y la ubicación de datos deben verificarse en la fuente oficial de cada proveedor y anotarse aquí con fecha**; no se dan por supuestas.

| Proveedor | Para qué | Datos que ve | Autenticación de la cuenta | Certificaciones (verificar y fechar) | Ubicación de datos | Contrato / DPA | Última revisión |
|---|---|---|---|---|---|---|---|
| Supabase | Base de datos, autenticación, realtime, función `notify` | Todos los datos de la app y correos | 2FA obligatorio | | Región del proyecto (ver panel) | Términos y DPA de Supabase (archivar) | |
| Cloudflare | Hosting, Worker (proxy), Turnstile | Tráfico, IP, correo y contraseña en tránsito (cifrado) | 2FA obligatorio | | Red global | Términos y DPA de Cloudflare (archivar) | |
| Google (Cloud + Inicio de sesión) | Inicio de sesión con Google | Nombre, correo y foto de la cuenta Google (alcances básicos) | 2FA obligatorio | | | Términos de Google Cloud / OAuth | |
| GitHub | Código, CI, Dependabot | Código fuente (sin secretos ni datos) | 2FA obligatorio | | | Términos de GitHub | |
| Servicios push de navegadores (FCM, Mozilla, Apple, Windows) | Entregar notificaciones | Endpoint y claves de la suscripción; el mensaje va cifrado | n/a | | | Términos de cada uno | |

## Criterios de selección y revisión
1. Cuenta de empresa o cuenta propia con 2FA; sin cuentas compartidas.
2. Cifrado en tránsito y en reposo, historial de incidentes divulgado y canal de soporte.
3. Datos exportables (la persona usuaria puede descargar los suyos; el proyecto puede restaurar en otro Supabase).
4. Cada año: revisar cambios de términos, incidentes publicados, certificaciones vigentes y si seguimos necesitando el servicio. Anotar la fecha en la tabla.
5. Cada servicio nuevo pasa por esta tabla **antes** de usarse, incluido su impacto en la política de privacidad.

## Dependencias de software
Gestionadas con `package-lock.json`, Dependabot semanal, `npm audit` y `npm audit signatures` en CI. Alternativas ante una dependencia comprometida: fijar versión anterior, reemplazar o eliminar (ver `04`).
