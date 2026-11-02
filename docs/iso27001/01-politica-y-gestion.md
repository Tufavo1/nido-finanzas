# Política de seguridad de la información y gestión del SGSI

> Documento controlado. **Versión 1.0 · 2026-11-02.** Estado: *borrador listo para aprobar*. Aprobación de la dirección: ____________________ (nombre, fecha). Revisión: anual o ante cambios importantes.

## 1. Propósito y alcance
Proteger la confidencialidad, integridad y disponibilidad de los datos financieros de las personas que usan Contigo y de los activos que los sostienen. Alcance: la PWA, el Worker de Cloudflare, Supabase (base de datos, autenticación, función `notify`), el repositorio y el proceso de desarrollo y despliegue.

## 2. Principios
1. **Mínimo privilegio:** cada persona ve y modifica solo lo suyo; lo compartido, solo quien pertenece al hogar (RLS).
2. **Defensa en profundidad:** validación en la interfaz, en el Worker y en la base de datos.
3. **Seguro por defecto:** nada se expone si no está en una lista de permitidos.
4. **Minimización de datos:** solo se guarda lo necesario para el servicio.
5. **Mejora continua:** hallazgos y pruebas alimentan el plan de tratamiento de riesgos.

## 3. Objetivos medibles (revisión trimestral)
| Objetivo | Indicador | Meta |
|---|---|---|
| Sin vulnerabilidades altas en producción | `npm audit --audit-level=high` en CI | 0 |
| Dependencias al día | PR de Dependabot abiertos más de 30 días | 0 |
| Recuperabilidad | Prueba de restauración (`scripts/restore-test.sh`) | al menos 1 por trimestre, éxito |
| Aislamiento de datos | Suites `supabase/tests` | 100 % en verde antes de cada despliegue |
| Respuesta a reportes | Acuse a reportes de vulnerabilidad | ≤ 3 días hábiles |

## 4. Roles y responsabilidades (5.2, 5.3, 5.4)
| Rol | Responsabilidad | Persona |
|---|---|---|
| Dirección | Aprueba política, recursos y riesgos aceptados; revisión anual | ____________ |
| Responsable de seguridad | Mantiene el SGSI, riesgos, incidentes y auditorías | ____________ |
| Desarrollo | Aplica el ciclo de desarrollo seguro y las revisiones | ____________ |
| Administración de plataforma | Cuentas de Supabase, Cloudflare, GitHub, Google Cloud; secretos y respaldos | ____________ |

Con una sola persona operando, la segregación de funciones (5.3) se compensa con: CI obligatoria, protección de rama, revisión de la pareja de desarrollo cuando exista y registro de cada cambio. Esto queda aceptado explícitamente como **riesgo R-12** en el registro de riesgos.

## 5. Control de acceso (5.15–5.18, 8.2–8.5)
- **Cuentas de plataforma** (Supabase, Cloudflare, GitHub, Google Cloud): segundo factor obligatorio, correo propio, sin cuentas compartidas, al menos un método de recuperación guardado fuera de línea.
- **Alta y baja:** quien termina su relación con el proyecto pierde acceso el mismo día; se rotan los secretos que conocía.
- **Revisión de accesos:** trimestral, con evidencia (captura de miembros de cada plataforma).
- **Producción:** solo se despliega desde la rama `main` con CI verde; los cambios de base de datos van por migración versionada.
- **Personas usuarias:** contraseña de 10 o más caracteres, CAPTCHA, límite de intentos, verificación en dos pasos opcional, bloqueo por inactividad y reconfirmación de contraseña en acciones delicadas.
- **Administradores de la app:** segundo factor obligatorio (aal2) y registro en `admin_audit`.

## 6. Secretos y claves (5.17, 8.24)
Inventario (sin valores):

| Secreto | Dónde vive | Rotación | Responsable |
|---|---|---|---|
| Llave `service_role` de Supabase | Secretos de la función `notify` | Anual y ante sospecha | Administración |
| URL y llave de Supabase del Worker | Secretos de Cloudflare Worker | Anual y ante sospecha | Administración |
| Claves VAPID (push) | Secretos de Supabase | Anual | Administración |
| Secreto de Turnstile | Supabase Auth y Cloudflare | Anual | Administración |
| Client secret de Google OAuth | Supabase Auth | Anual | Administración |
| Clave de cifrado de respaldos | Gestor de contraseñas, **separada** de los respaldos | Anual | Administración |
| Token de despliegue de Cloudflare | Máquina de desarrollo / GitHub secrets | 6 meses | Administración |

Reglas: nunca en el repositorio (CI ejecuta gitleaks), nunca en el navegador, nunca en mensajes ni capturas. Si un secreto se expone: rotarlo de inmediato y abrir un incidente.

## 7. Ciclo de desarrollo seguro y cambios (8.25–8.32)
1. Todo cambio entra por pull request con la plantilla de `.github/pull_request_template.md`.
2. CI: tipos, lint, 356+ pruebas, `npm audit`, gitleaks y CodeQL.
3. Cambios de base de datos: migración nueva + prueba SQL (`supabase/tests`) + prueba en local antes de `db push --remote`.
4. Despliegue: `npm ci && npm test && npm run deploy`; se anota versión y fecha en el historial de releases.
5. Vuelta atrás: el Worker permite volver a una versión anterior desde Cloudflare; las migraciones se corrigen con una migración nueva y, si hace falta, con restauración desde respaldo.
6. Entornos: local (Supabase en Docker, datos de prueba) separado de producción; no se usan datos reales en pruebas (8.31, 8.33).
7. Código fuente: acceso solo a quien lo necesita; rama `main` protegida (ver `README.md`, acciones manuales).

## 8. Formación y concientización (6.3, 6.7, 6.8)
- Quien tenga acceso a producción revisa una vez al año: phishing, gestión de secretos, esta política y el procedimiento de incidentes. Se guarda constancia (fecha y asistentes).
- Trabajo remoto: equipo con disco cifrado, bloqueo de pantalla, actualizaciones automáticas, sin sesiones de plataforma en equipos compartidos.
- Cualquier evento sospechoso se informa de inmediato según `04-incidentes.md`.

## 9. Auditoría interna y revisión por la dirección (cláusulas 9.2, 9.3, 10)
- **Auditoría interna** anual: se recorre la declaración de aplicabilidad (`03-declaracion-aplicabilidad.md`) verificando evidencia control por control. Hallazgos → acciones correctivas con fecha y responsable.
- **Revisión por la dirección** anual: resultados de objetivos, incidentes, auditorías, cambios de riesgo, recursos y mejoras. Acta firmada.
- **No conformidades:** se registran, se analiza la causa, se corrige y se verifica la eficacia.

### Registro de revisiones
| Fecha | Tipo | Resultado | Acciones | Responsable |
|---|---|---|---|---|
| 2026-11-02 | Auditoría de seguridad técnica (interna) | 4 hallazgos corregidos con pruebas | Migraciones `seguridad_endurece` y `fechas_validas` | Desarrollo |
| | | | | |
