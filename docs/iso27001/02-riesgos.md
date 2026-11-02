# Registro de riesgos y plan de tratamiento

> Versión 1.0 · 2026-11-02. Método: probabilidad (1–3) × impacto (1–3) = nivel. 1–2 bajo, 3–4 medio, 6–9 alto. **Criterio de aceptación: nivel ≤ 3 después del tratamiento.** Revisión trimestral y ante cada cambio importante.

| ID | Activo | Amenaza / riesgo | P | I | Nivel | Tratamiento (controles) | Residual | Estado |
|---|---|---|---|---|---|---|---|---|
| R-01 | Datos de hogares | Una persona ve datos de otro hogar o de su pareja marcados como personales | 2 | 3 | 6 | RLS por hogar y por dueño; pruebas `rls`, `aislamiento`, `privacidad`, `seguridad` en cada cambio (5.15, 8.3) | 1×3=3 | Tratado |
| R-02 | Cuentas de personas | Robo de contraseña / fuerza bruta / relleno de credenciales | 3 | 3 | 9 | Contraseña ≥10, CAPTCHA, límites de intentos en el Worker, verificación en dos pasos opcional, reconfirmación en acciones delicadas (5.17, 8.5) | 2×2=4 | Tratado (aceptado medio) |
| R-03 | Sesión en dispositivo | Teléfono prestado o perdido con la app abierta | 2 | 2 | 4 | Bloqueo por inactividad con contraseña; cierre de otras sesiones (8.1) | 1×2=2 | Tratado |
| R-04 | Panel de administración | Cuenta administradora comprometida | 1 | 3 | 3 | Segundo factor obligatorio (aal2) + `admin_audit` (incluye cada consulta de nombres de hogares y personas) + el panel solo ve nombres, nunca correos ni datos financieros + funciones `admin_*` con `search_path` fijo (8.2, 5.18, 8.11) | 1×3=3 | Tratado |
| R-05 | Función `notify` | Uso para atacar redes internas (SSRF) o repetir avisos | 2 | 2 | 4 | Lista de endpoints push conocidos, https obligatorio, `notified_at` de un solo uso (8.26) | 1×2=2 | Tratado |
| R-06 | Supabase / API | Acceso directo a la API saltándose la app | 2 | 3 | 6 | Worker con rutas permitidas y control de origen; RLS como barrera final; llave real solo en el Worker (8.20, 8.21) | 1×3=3 | Tratado |
| R-07 | Dependencias | Paquete vulnerable o comprometido (cadena de suministro) | 2 | 3 | 6 | Dependabot, `npm audit` y `audit signatures` en CI, `package-lock` fijo, CodeQL (8.8, 5.21) | 2×2=4 | Tratado (aceptado medio) |
| R-08 | Secretos | Filtración de llaves en el repositorio o en chats | 2 | 3 | 6 | gitleaks en CI, `.gitignore` de respaldos, inventario y rotación (5.17, 8.4) | 1×3=3 | Tratado |
| R-09 | Datos | Pérdida o corrupción de la base de datos | 1 | 3 | 3 | `scripts/backup.sh` cifrado (y los respaldos automáticos de Supabase solo si el plan los incluye: verificar) + prueba trimestral de restauración (8.13) | 1×3=3 | Tratado **tras ejecutar la primera prueba** |
| R-10 | Disponibilidad | Caída de Supabase o Cloudflare | 2 | 2 | 4 | Lectura sin conexión (PWA), plan de continuidad (5.29, 5.30, 8.14) | 2×2=4 | Aceptado medio |
| R-11 | Privacidad | Datos personales conservados sin necesidad o sin informar | 2 | 2 | 4 | Política de privacidad versionada, borrado de cuenta, plazos en `07-registro-retencion.md` (5.34, 8.10) | 1×2=2 | Tratado |
| R-12 | Organización | Una sola persona con todos los accesos (sin segregación) | 3 | 2 | 6 | CI obligatoria, protección de rama, registro de cambios, copia de la clave de recuperación con persona de confianza | 2×2=4 | **Aceptado medio por la dirección** (firma pendiente) |
| R-13 | Proveedores | Incidente o cambio de condiciones de Supabase, Cloudflare, Google o GitHub | 2 | 3 | 6 | Registro de proveedores con certificaciones y revisión anual (5.19–5.23); datos exportables por la persona usuaria | 2×2=4 | Aceptado medio |
| R-14 | Inicio con Google | Toma de cuenta por correo de Google comprometido; vinculación automática de identidades | 2 | 3 | 6 | Contraseña propia obligatoria tras entrar con Google, 2FA opcional, entrada con el botón oficial de Google y token de un solo uso (nonce con SHA-256) verificado por Supabase, sin salir de Contigo; la redirección anterior queda como respaldo y está validada en el Worker (`rewriteLocation`). La política `Cross-Origin-Opener-Policy` pasó a `same-origin-allow-popups`, que Google exige para su ventana de acceso, aceptación de términos registrada (5.16, 5.17) | 1×3=3 | Tratado |
| R-15 | Aplicación web | XSS / inyección de contenido | 1 | 3 | 3 | CSP estricta sin scripts en línea, React escapa por defecto, validaciones en base de datos (8.26, 8.28) | 1×3=3 | Tratado |
| R-16 | Registros | Sin visibilidad de ataques por falta de registros | 2 | 2 | 4 | Registros de Supabase Auth y Cloudflare + revisión mensual según `07-registro-retencion.md` (8.15, 8.16) | 2×1=2 | Tratado **tras la primera revisión** |

## Plan de acciones abiertas
| Acción | Riesgo | Responsable | Fecha límite | Estado |
|---|---|---|---|---|
| Firmar política y aceptar R-12, R-10, R-13 | R-12 | Dirección | | Abierta |
| Activar 2FA y protección de rama en GitHub / Cloudflare / Supabase / Google | R-02, R-12 | Administración | | Abierta |
| Programar `backup.sh` y ejecutar la primera `restore-test.sh` sobre un respaldo de producción | R-09 | Administración | | Abierta |
| Primera revisión mensual de registros | R-16 | Seguridad | | Abierta |
| Pedir certificados vigentes a proveedores y llenar `06-proveedores.md` | R-13 | Seguridad | | Abierta |
