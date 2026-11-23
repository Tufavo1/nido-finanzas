<!-- Copyright (c) 2026 Dinovance -->
# Observabilidad de infraestructura (staging, solo 127.0.0.1)

Código en `/home/jromero/proyectos/nido-selfhost` (`observability/`, `docker-compose.yml`, `Makefile`) y la migración `supabase/migrations/20261121150000_ingesta_seguridad_gateway.sql`. Todo lo de abajo se ejecutó en staging el 2026-11-21.

## Arquitectura
```
app/curl -> Kong (JSON, x-request-id) -> GoTrue / PostgREST / Realtime
  todos los servicios -> driver de logs Docker "syslog" UDP -> 127.0.0.1:55340 -> Alloy -> Loki (30 d)
  Alloy (sondas blackbox cada 30 s) -> Prometheus (30 d)
  Grafana (Loki + Prometheus) -> reglas de alerta -> ntfy (127.0.0.1:55332) -> teléfono del admin
  sec-ingest: lee de Loki los fallos de Kong -> public.ingest_security_event() como rol sec_ingest -> security_events -> security_overview()
```
Por qué syslog/UDP y no `docker.sock` ni leer `/var/lib/docker`: el socket equivale a root en el host; los archivos de Docker son de root. El driver de logs es oficial, no necesita montar nada y es solo salida. UDP porque, medido, un contenedor con el driver apuntando a un puerto sin oyente arranca y termina bien, y `docker logs` sigue funcionando (dual logging): si el colector cae, la pila no se cae (se pierden líneas, no servicio). Los servicios de observabilidad usan json-file para no crear bucles.

## Puertos (todo 127.0.0.1)
| Servicio | Puerto host | Nota |
|---|---|---|
| Grafana | 55330 | usuario `admin`, clave `GRAFANA_ADMIN_PASSWORD` en `.env` (generada por `make secrets`, nunca impresa) |
| ntfy | 55332 | `deny-all` por defecto; usuario `admin`, clave `NTFY_ADMIN_PASSWORD`; tópico `nido-alertas` |
| Alloy syslog | 55340/udp | solo para el daemon de Docker local |
| Loki, Prometheus, sec-ingest | ninguno | solo red interna del compose |

Operar: `make obs-up` (crea `OBS_DATA_DIR`, habilita `sec_ingest`, levanta el profile), `make obs-down`. Datos en `OBS_DATA_DIR` (def. `./obs-data`, luego `/mnt/archivo/nido-obs`).

## Qué se registra
- **Kong**: acceso en JSON (`config/kong-logformat.conf`): `ts, method, path, status, rt_s (segundos), bytes, req_id, ip`. Sin cuerpos, sin cabeceras (Authorization/apikey), sin query string, IP con último octeto en 0 (IPv6: 3 primeros grupos). Plugin `correlation-id` global (`x-request-id`, reutiliza el de la app, lo devuelve en la respuesta). Un `x-request-id` de forma rara se registra como `bad`.
- **GoTrue** con `GOTRUE_API_REQUEST_ID_HEADER=x-request-id`; **PostgREST** lo recibe en `request.headers`. Verificado: ver pruebas.
- Etiqueta Loki `service` = db, auth, rest, realtime, gateway, mailpit.
- Retención: Loki 720 h (compactor con retención), Prometheus 30 d. Ver `limits_config` en `observability/loki.yml`.

## Ingesta de seguridad
- `login_failed` (400/401 en `/auth/v1/token`), `login_blocked` (429 allí), `mfa_failed` (400/401/422/429 en `/factors/*/verify`), `auth_spike` (>= 30 respuestas 401/403 por minuto).
- Rol `sec_ingest` (nologin en la migración; `make obs-up` le da login y clave de `.env`): solo EXECUTE de `ingest_security_event`, que valida tipo, severidad, claves permitidas del detalle, formato de ip/req_id, y corta a 600 eventos/min. La función es SECURITY DEFINER con `search_path=''`.
- Prueba de privilegios (`supabase/tests/ingesta_seguridad.sql`, como supabase_admin): no puede leer ni borrar ni actualizar `security_events`, no puede leer `auth.users`, rechaza tipos ajenos y claves como `email`. Todas las líneas `OK`.
- `actor_hint` = `ip_` + hash de la red /24 (no de la cuenta).

## Alertas (Grafana, evaluación cada 1 min, hacia ntfy)
| Regla | Condición |
|---|---|
| Fuerza bruta de login | > 10 fallos en 5 min desde una misma red (N=10, X=5; editar en `grafana/provisioning/alerting/rules.yml`) |
| Fallos de segundo factor | > 5 en 5 min por red |
| Muchos 429 | > 20 en 5 min |
| Picos de 5xx | > 5 en 5 min |
| Servicio caído | sonda `probe_success` = 0 durante 1 min (gateway, auth, rest, db, realtime, loki, grafana) |

Disponibilidad: sondas blackbox de Alloy + Prometheus + regla de Grafana (no Uptime Kuma). Estado en Grafana > Explore > Prometheus: `probe_success`.

## Pruebas reales (evidencia)
- Kong JSON: `{"ts":"2026-11-21T19:00:54+00:00","method":"POST","path":"/auth/v1/token","status":400,"rt_s":0.009,"bytes":81,"req_id":"brute-003","ip":"172.20.0.0"}`.
- `x-request-id` de extremo a extremo: con la cabecera `app-test-0001` el log de GoTrue mostró `"request_id":"app-test-0001"`; una función temporal de PostgREST devolvió `app-test-0003` (luego se borró); sin cabecera Kong generó un uuid y lo devolvió en la respuesta.
- 26 logins falsos: 20 x 400 y 6 x 429; 4 verificaciones MFA falsas: 4 x 401. En `security_events` quedaron `login_failed` 20, `login_blocked` 6, `mfa_failed` 4 (los eventos de prueba permanecen: la tabla es de solo agregar).
- Alerta real: llegó a ntfy "[FIRING:1] Fuerza bruta de login ... Value: A=20" y luego "[RESOLVED]". Parando `rest` ~3 min llegó "[FIRING:1] Servicio caido ... service = rest ... critical" (y se volvió a arrancar `rest`).
- Primer intento falló con 401 de ntfy (el usuario admin no se creaba porque el archivo de usuarios aún no existía); se corrigió el arranque de ntfy y la alerta pendiente se entregó.

## Medidas reales (docker stats, en reposo con poco tráfico)
Grafana 143 MiB, Loki 87, Alloy 52, sec-ingest 23, Prometheus 20, ntfy 12: total ~337 MiB. Disco de datos tras ~10 min: 51 MB (casi todo Grafana). Imágenes: ~2,7 GB (Grafana 968 MB, Alloy 647 MB, Prometheus 508 MB, ingesta 320 MB, Loki 168 MB, ntfy 109 MB). El crecimiento de logs a 30 días NO está medido; una línea de Kong pesa ~200 bytes.

## Seguir un error con un x-request-id
1. La app envía `x-request-id` (si no, Kong lo genera y lo devuelve en la respuesta).
2. Grafana > Explore > Loki: `{job="docker"} |= "REQ_ID"` devuelve la línea de Kong (estado, ruta, latencia) y la de GoTrue (`request_id`, error). PostgREST lo ve en `request.headers`; para verlo en Postgres hay que registrarlo desde la función/RPC.
3. Si es un error de la app, `client_errors.correlation_id` lleva el mismo identificador.

## Exponer ntfy / Grafana más adelante
No se exponen hoy. Con el túnel (README de nido-selfhost) añadir hostnames de ingress `ntfy` -> `http://ntfy:8080` y, si se quiere, `grafana` -> `http://grafana:3000`, ambos detrás de Cloudflare Access (identidad del admin, no service token), mantener ntfy en `deny-all` y suscribir la app de ntfy con usuario y clave, y cambiar `NTFY_BASE_URL`. Los servicios deben estar en la red del compose (ya lo están).

## Qué NO cubre
- Producción: el Worker de Cloudflare y su proxy. El dueño activa `observability`; el parche está listo y NO aplicado en `docs/mobile/patches/wrangler-observability.patch` (verificado solo con `git apply --check`).
- Por cuenta: Kong no ve el cuerpo, así que la fuerza bruta es por red /24 y global, no por correo. Un atacante distribuido no se agrupa.
- Falsificación: quien pueda escribir UDP en 127.0.0.1:55340 (un proceso local) puede inventar líneas de log y, con ellas, eventos. Puerto solo local; no es frontera de confianza fuerte.
- GoTrue registra `remote_addr` completo (hoy la IP del puente Docker); no se enmascara en Loki. Detrás del túnel será la IP interna de Kong, no la del cliente.
- Entrega al teléfono real no probada (solo ntfy local). Pico 401/403 (`auth_spike`) cubierto por el código pero no disparado en vivo. Llamada real a `security_overview()` con un administrador aal2 no probada; sí está probado que las filas existen con los tipos que ese RPC cuenta.
- Retención de 30 días: configurada, no observada (haría falta esperar). Imágenes sin escanear y sin digest fijo.
- Los eventos no se deduplican entre reinicios de `sec-ingest` más allá de una ventana de 30 s.
