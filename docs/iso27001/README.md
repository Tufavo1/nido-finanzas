# Contigo y la ISO/IEC 27001:2022

## Qué es y qué no es esto
La 27001 certifica un **Sistema de Gestión de Seguridad de la Información (SGSI)** de una organización, mediante una auditoría de un organismo acreditado. Este directorio contiene el SGSI de Contigo **listo para aprobar y operar**, y el proyecto implementa los controles técnicos que le corresponden. **No es una certificación ni una opinión de auditoría**: para certificarse hay que aprobar los documentos, operar el sistema un tiempo con registros reales (al menos un ciclo de auditoría interna y revisión por la dirección) y contratar al organismo certificador.

## Documentos
| Documento | Cláusulas / controles |
|---|---|
| [01 Política y gestión](01-politica-y-gestion.md) | 4–10, 5.1–5.4, 5.15–5.18, 6.x, 8.25–8.32 |
| [02 Riesgos y tratamiento](02-riesgos.md) | Cláusula 6 |
| [03 Declaración de aplicabilidad](03-declaracion-aplicabilidad.md) | Los 93 controles del Anexo A |
| [04 Incidentes](04-incidentes.md) | 5.24–5.28, 6.8 |
| [05 Respaldos y continuidad](05-respaldos-continuidad.md) | 8.13, 8.14, 5.29, 5.30 |
| [06 Proveedores](06-proveedores.md) | 5.19–5.23 |
| [07 Clasificación, registros y retención](07-registro-retencion.md) | 5.12, 5.33, 5.34, 8.10, 8.15, 8.16 |
| [`SECURITY.md`](../../SECURITY.md) y `web/public/.well-known/security.txt` | 5.5, 6.8, 8.8 |

## Lo que ya está en el proyecto (código y configuración)
- **Aislamiento y privilegios:** RLS por hogar y por dueño, funciones con `search_path` fijo, administración con segundo factor y auditoría. Pruebas: `supabase/tests/*.sql`.
- **Red y aplicación:** Worker con rutas permitidas, control de origen, límites de uso, validación de la redirección a Google; cabeceras (CSP, HSTS…). Pruebas: `web/worker/proxy.test.ts`.
- **Identidad:** contraseñas exigentes, CAPTCHA, inicio con Google con contraseña propia obligatoria, **verificación en dos pasos opcional para todas las personas** (Ajustes → Seguridad, y desafío al entrar), bloqueo por inactividad, reconfirmación en acciones delicadas.
- **Desarrollo seguro:** CI con tipos, lint, pruebas, `npm audit` y firmas, **gitleaks** y **CodeQL** (`.github/workflows/security.yml`), Dependabot, plantilla de PR, `CODEOWNERS`.
- **Respaldos:** `scripts/backup.sh` (cifrado AES-256, permisos 600, suma SHA-256, retención) y `scripts/restore-test.sh` (restauración en base temporal con verificación). Probados contra la base local.
- **Divulgación responsable:** `SECURITY.md` y `/.well-known/security.txt`.

## Lo que tiene que hacer una persona (no se puede hacer desde el código)
Marca cada punto y guarda la evidencia (captura o registro) en una carpeta cifrada de evidencias.

1. **Aprobar y firmar** los documentos 01–07: completar nombres de roles, firma de la dirección y aceptación de los riesgos R-10, R-12 y R-13.
2. **Segundo factor en todas las cuentas de plataforma:** Supabase, Cloudflare, GitHub y Google Cloud. Guardar los códigos de recuperación fuera de línea.
3. **Proteger la rama `main` en GitHub** (revisión requerida y CI verde). Con `gh` (los IDs de los checks son los nombres de los jobs de `.github/workflows`):
   ```
   gh api -X PUT repos/Tufavo1/nido-finanzas/branches/main/protection --input - <<'JSON'
   {"required_status_checks":{"strict":true,"contexts":["web","Búsqueda de secretos","Análisis de código (CodeQL)","Dependencias vulnerables"]},
    "enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":0,"require_code_owner_reviews":false},
    "restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false}
   JSON
   ```
   (Con una sola persona, `required_approving_review_count: 0` obliga a pasar por PR y CI sin bloquearte; súbelo a 1 cuando haya una segunda persona.) Activa también en GitHub → Settings → Security: *Private vulnerability reporting*, *Dependabot alerts* y *Secret scanning*.
4. **Activar la verificación en dos pasos (TOTP) en producción:** Supabase → Authentication → Multi-Factor → habilitar TOTP (enroll y verify). Localmente ya está activado en `supabase/config.toml`.
5. **Programar los respaldos** y hacer la **primera prueba de restauración con un respaldo de producción** (`05-respaldos-continuidad.md`). Registrar el resultado.
6. **Proveedores:** llenar `06-proveedores.md` con certificaciones, región y contratos vigentes, con fecha.
7. **Registros:** hacer la primera revisión mensual (`07 §2`) y verificar la retención real de logs de tu plan de Supabase y Cloudflare.
8. **Retención y privacidad:** decidir el plazo de cuentas inactivas y revisar la política de privacidad con asesoría legal (marco chileno vigente).
9. **Formación:** primera sesión de concientización (`01 §8`) y registro.
10. **Primera auditoría interna y revisión por la dirección** (`01 §9`).
11. **Certificación (opcional):** elegir un organismo acreditado, una vez que el SGSI haya operado al menos un ciclo con registros.

## Evidencia a conservar
Capturas de: protección de rama, miembros de cada plataforma con 2FA, ajustes de Supabase Auth (longitud de contraseña, CAPTCHA, proveedores, MFA), nombres de los secretos del Worker, resultados de CI y CodeQL, informe de restauración, actas de revisión de riesgos, de auditoría interna y de la dirección, y registro de formación.
