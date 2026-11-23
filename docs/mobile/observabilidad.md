<!-- Copyright (c) 2026 Dinovance -->
# Observabilidad: qué se registra hoy, qué falta y qué se construye (2026-11-21)

Medido con comandos reales sobre la pila de staging y el código (no es una estimación).

## Hoy
| Capa | Qué registra | Hueco |
|---|---|---|
| App web | `ErrorBoundary` y algunos `console.error` | **Los errores quedan en el teléfono del usuario y se pierden.** Nada llega al servidor. |
| Worker de Cloudflare | `console.error/warn` (proxy sin configurar, upstream caído, timeout) | `wrangler.jsonc` **no tiene `observability`**: esos logs no se guardan. (Cambio de producción: lo hace el dueño; está fuera del alcance de los agentes.) |
| Kong (gateway) | Línea de acceso en texto plano: IP, ruta, estado (verificado: el POST a /token con 400 quedó registrado) | Sin `x-request-id`, sin formato JSON, sin latencia; vive solo en el log de Docker (rotación 10 MB × 3 = ~30 MB por contenedor), **sin almacenamiento central ni retención**. |
| GoTrue (login) | `auth.audit_log_entries` registra: login, challenge_created (MFA), user_signedup, user_repeated_signup, token_revoked, user_recovery_requested, token_refreshed, user_modified, verification_attempted, user_updated_password, factor_in_progress, logout | **No registra intentos de login FALLIDOS** (no existe una acción de fallo): solo se ven como 400/401/429 en el acceso de Kong. |
| Postgres | `log_connections/disconnections`, `log_statement=ddl`, consultas > 1 s | Los rechazos de RLS y los errores de la app no quedan en una tabla consultable. |
| Panel admin | Tabla `admin_audit` (acciones de administradores) | **No hay tabla de eventos de seguridad ni de errores de clientes.** |

## Qué se construye
1. **`client_errors`** (migración nueva): errores de la app (web y Android) anonimizados, con versión, pantalla, código de error tipado (`appError`), identificador de correlación y sin datos personales ni montos. Se llena con una función RPC limitada por tasa.
2. **`security_events`** (migración nueva) y una función `security_overview()` para administradores con MFA: combina `auth.audit_log_entries`, los eventos propios (dispositivo nuevo, cambios de rol/correo, permiso de notificaciones revocado, cola de push atascada) y, cuando exista, la ingesta de fallos desde Kong. Solo lectura para administradores aal2; nadie edita ni borra.
3. **Correlación de extremo a extremo:** la app genera `x-request-id`; viaja por Worker, Kong, GoTrue y PostgREST para seguir un error completo.
4. **Android:** captura de cierres inesperados (`UncaughtExceptionHandler`), registro local circular sin datos personales, envío en el siguiente arranque, y un latido de salud del servicio de notificaciones (permiso activo, último evento, optimización de batería) para avisar si la captura se detiene.
5. **Panel de seguridad en la pantalla de administración**: eventos, alertas con severidad, salud de servicios y errores recientes, con la limitación honesta de que muestra indicios.
6. **Fase siguiente (infraestructura en Docker, solo 127.0.0.1):** recolector central de logs con retención (Loki + Grafana o equivalente), Kong con formato JSON y `correlation-id`, alertas al teléfono del administrador, y monitor de disponibilidad.

## Fuera del alcance de los agentes (lo hace el dueño)
Activar `observability` en el Worker de producción, Logpush o analíticas de Cloudflare (según el plan), y alertas del panel de Cloudflare. Los agentes solo preparan el cambio como parche.
