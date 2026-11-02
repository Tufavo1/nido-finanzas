# Declaración de aplicabilidad (SoA) · ISO/IEC 27001:2022, Anexo A

> Versión 1.0 · 2026-11-02. Aprobación: ____________________.
>
> **Estado:** *Implementado* = hay control técnico en el código o en la configuración, con evidencia. *Documentado* = hay procedimiento o política escrita, a aplicar y registrar. *Pendiente* = depende de una decisión o de una acción de una persona (ver README). *Heredado* = lo cumple el proveedor de nube (verificar su certificación en `06-proveedores.md`). *No aplica* = justificado.

| Control | Nombre | Aplica | Estado | Evidencia / observación |
|---|---|---|---|---|
| 5.1 | Políticas de seguridad de la información | Sí | Documentado | 01-politica-y-gestion.md (falta firma) |
| 5.2 | Roles y responsabilidades | Sí | Documentado | 01 §4 (completar nombres) |
| 5.3 | Segregación de funciones | Sí | Documentado | 01 §4; riesgo R-12 aceptado |
| 5.4 | Responsabilidades de la dirección | Sí | Documentado | 01 §9 |
| 5.5 | Contacto con autoridades | Sí | Documentado | 04-incidentes.md §6 |
| 5.6 | Contacto con grupos de interés | Sí | Pendiente | Suscribirse a avisos de seguridad de Supabase, Cloudflare, GitHub y npm |
| 5.7 | Inteligencia de amenazas | Sí | Implementado | Dependabot, `npm audit`, avisos de GitHub |
| 5.8 | Seguridad en la gestión de proyectos | Sí | Implementado | Plantilla de PR con checklist |
| 5.9 | Inventario de activos | Sí | Documentado | README §Alcance, 01 §6, 06-proveedores.md |
| 5.10 | Uso aceptable de activos | Sí | Documentado | 01 §5 y §8 |
| 5.11 | Devolución de activos | Sí | Documentado | 01 §5 (baja el mismo día) |
| 5.12 | Clasificación de la información | Sí | Documentado | 07-registro-retencion.md §1 |
| 5.13 | Etiquetado de la información | Sí | Documentado | 07 §1 (respaldos con nombre y cifrado) |
| 5.14 | Transferencia de información | Sí | Implementado | TLS en todo el recorrido, HSTS, CSP; respaldos cifrados |
| 5.15 | Control de acceso | Sí | Implementado | RLS; `supabase/tests/rls.sql`, `aislamiento.sql` |
| 5.16 | Gestión de identidades | Sí | Implementado | Supabase Auth; Google; 1 cuenta por persona |
| 5.17 | Información de autenticación | Sí | Implementado | Política de contraseñas, 2FA opcional, `01 §6` secretos |
| 5.18 | Derechos de acceso | Sí | Implementado | Roles por hogar; admin con aal2; revisión trimestral (01 §5) |
| 5.19 | Seguridad con proveedores | Sí | Documentado | 06-proveedores.md |
| 5.20 | Seguridad en acuerdos con proveedores | Sí | Documentado | 06 (términos y DPA a archivar) |
| 5.21 | Cadena de suministro TIC | Sí | Implementado | `package-lock`, `npm audit signatures`, Dependabot |
| 5.22 | Seguimiento de servicios de proveedores | Sí | Documentado | 06 (revisión anual) |
| 5.23 | Seguridad en servicios en la nube | Sí | Documentado | 06; Worker como capa propia |
| 5.24 | Planificación de gestión de incidentes | Sí | Documentado | 04-incidentes.md |
| 5.25 | Evaluación de eventos | Sí | Documentado | 04 §2 |
| 5.26 | Respuesta a incidentes | Sí | Documentado | 04 §3 |
| 5.27 | Aprendizaje de incidentes | Sí | Documentado | 04 §5 |
| 5.28 | Recopilación de evidencias | Sí | Documentado | 04 §4 |
| 5.29 | Seguridad durante una interrupción | Sí | Documentado | 05-respaldos-continuidad.md §3 |
| 5.30 | Preparación TIC para la continuidad | Sí | Documentado | 05 §3; PWA con lectura sin conexión |
| 5.31 | Requisitos legales y contractuales | Sí | Documentado | 07 §3 (verificar con asesoría legal) |
| 5.32 | Propiedad intelectual | Sí | Documentado | Licencias de dependencias vía `package-lock`; titular Dinovance |
| 5.33 | Protección de registros | Sí | Documentado | 07 §2 |
| 5.34 | Privacidad y protección de datos personales | Sí | Implementado | Política de privacidad y términos versionados, borrado de cuenta, RLS |
| 5.35 | Revisión independiente | Sí | Pendiente | Auditoría externa/certificación: decisión de la dirección |
| 5.36 | Cumplimiento de políticas y normas | Sí | Documentado | 01 §9 (auditoría interna anual) |
| 5.37 | Procedimientos operativos documentados | Sí | Documentado | README, `scripts/`, 05 |
| 6.1 | Selección de personal | Sí | Pendiente | Aplicar si se suma gente al proyecto |
| 6.2 | Términos y condiciones de empleo | Sí | Pendiente | Cláusula de confidencialidad al sumar gente |
| 6.3 | Concientización y formación | Sí | Documentado | 01 §8 (registrar la primera sesión) |
| 6.4 | Proceso disciplinario | Sí | Pendiente | Definir si se suma gente |
| 6.5 | Responsabilidades tras terminación | Sí | Documentado | 01 §5 |
| 6.6 | Acuerdos de confidencialidad | Sí | Pendiente | Firmar con quien acceda a datos o secretos |
| 6.7 | Trabajo remoto | Sí | Documentado | 01 §8 |
| 6.8 | Notificación de eventos de seguridad | Sí | Implementado | `SECURITY.md`, `security.txt`, 04 §1 |
| 7.1 | Perímetros físicos de seguridad | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.2 | Entrada física | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.3 | Oficinas, salas e instalaciones | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.4 | Monitoreo de seguridad física | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.5 | Amenazas físicas y ambientales | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.6 | Trabajo en áreas seguras | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.7 | Escritorio y pantalla limpios | Sí | Documentado | 01 §8 |
| 7.8 | Ubicación y protección de equipos | Sí | Documentado | 01 §8 |
| 7.9 | Activos fuera de las instalaciones | Sí | Documentado | 01 §8 |
| 7.10 | Medios de almacenamiento | Sí | Documentado | Respaldos cifrados (05 §1) |
| 7.11 | Servicios de apoyo | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.12 | Seguridad del cableado | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.13 | Mantenimiento de equipos | Sí | Heredado | No hay instalaciones propias: centros de datos de Supabase y Cloudflare (06) |
| 7.14 | Eliminación segura de equipos | Sí | Documentado | Borrado seguro del disco al dar de baja el equipo (01 §8) |
| 8.1 | Dispositivos de usuario final | Sí | Implementado | Bloqueo por inactividad; cierre remoto de sesiones |
| 8.2 | Derechos de acceso privilegiado | Sí | Implementado | Admin con aal2 + `admin_audit` |
| 8.3 | Restricción de acceso a la información | Sí | Implementado | RLS y funciones con `search_path` fijo |
| 8.4 | Acceso al código fuente | Sí | Documentado | GitHub con 2FA, CODEOWNERS, rama protegida (README) |
| 8.5 | Autenticación segura | Sí | Implementado | Contraseña, CAPTCHA, límites, 2FA, reconfirmación |
| 8.6 | Gestión de la capacidad | Sí | Implementado | Límites en el Worker; panel de uso de Supabase/Cloudflare |
| 8.7 | Protección contra malware | Sí | Implementado | CSP, sin ejecución de contenido de usuario, escáner de dependencias |
| 8.8 | Gestión de vulnerabilidades técnicas | Sí | Implementado | Dependabot, audit, CodeQL, auditoría interna 2026-11-02 |
| 8.9 | Gestión de la configuración | Sí | Implementado | `_headers`, `wrangler`, `config.toml`, migraciones versionadas |
| 8.10 | Eliminación de información | Sí | Implementado | `delete_account`, `leave_household`; 07 §2 |
| 8.11 | Enmascaramiento de datos | Sí | Implementado | Datos personales entre parejas ocultos por RLS; sin datos reales en pruebas |
| 8.12 | Prevención de fuga de datos | Sí | Implementado | Worker con rutas permitidas, CSP `connect-src`, respaldos fuera de git |
| 8.13 | Respaldo de la información | Sí | Implementado | `scripts/backup.sh`, `restore-test.sh` (probado en local; falta ejecutarlo en producción) |
| 8.14 | Redundancia de instalaciones | Sí | Heredado | Infraestructura redundante de Supabase y Cloudflare |
| 8.15 | Registro de eventos | Sí | Documentado | 07 §2; `admin_audit`; registros de Supabase y Cloudflare |
| 8.16 | Actividades de monitoreo | Sí | Documentado | 07 §2 (revisión mensual) |
| 8.17 | Sincronización de relojes | Sí | Heredado | Servidores de proveedores; zona America/Santiago explícita en la base |
| 8.18 | Uso de programas utilitarios privilegiados | Sí | Documentado | `supabase_admin` y llave `service_role` solo en administración |
| 8.19 | Instalación de software | Sí | Implementado | Solo dependencias del lockfile; revisión de PR de Dependabot |
| 8.20 | Seguridad de redes | Sí | Implementado | Worker + TLS + HSTS |
| 8.21 | Seguridad de servicios de red | Sí | Implementado | Rutas permitidas, límites de uso, control de origen |
| 8.22 | Segregación de redes | Sí | Heredado | Aislamiento del proveedor; el navegador nunca habla con la base directamente |
| 8.23 | Filtrado web | No | No aplica | No hay navegación de usuarios finales gestionada por el proyecto |
| 8.24 | Uso de criptografía | Sí | Implementado | TLS 1.2+, HSTS preload, contraseñas con hash de Supabase, respaldos AES-256 |
| 8.25 | Ciclo de vida de desarrollo seguro | Sí | Implementado | CI, PR, pruebas, 01 §7 |
| 8.26 | Requisitos de seguridad de aplicaciones | Sí | Implementado | Validaciones, RLS, CSP, lista de endpoints push |
| 8.27 | Arquitectura e ingeniería segura | Sí | Implementado | Navegador→Worker→Supabase; llave real fuera del navegador |
| 8.28 | Codificación segura | Sí | Implementado | TypeScript estricto, oxlint, React, CodeQL |
| 8.29 | Pruebas de seguridad | Sí | Implementado | Suites `seguridad`, `aislamiento`, `privacidad`, `integridad`; e2e |
| 8.30 | Desarrollo subcontratado | No | No aplica | Sin desarrollo subcontratado (revisar si cambia) |
| 8.31 | Separación de entornos | Sí | Implementado | Supabase local en Docker vs. producción |
| 8.32 | Gestión de cambios | Sí | Implementado | PR + plantilla + CI + migraciones |
| 8.33 | Información de prueba | Sí | Implementado | Datos ficticios en local; respaldos reales nunca en pruebas ajenas |
| 8.34 | Protección de sistemas en auditorías | Sí | Documentado | Auditorías con cuentas de solo lectura; 01 §9 |

**Resumen:** Documentado: 39, Heredado: 12, Implementado: 34, No aplica: 2, Pendiente: 6 (total 93).
