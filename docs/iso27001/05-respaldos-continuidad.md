# Respaldos, recuperación y continuidad

> Versión 1.0 · 2026-11-02.

## 1. Respaldos (8.13)
- **Qué:** esquema `public` completo (hogares, gastos, deudas, metas, sueldos…). Los usuarios y contraseñas viven en el esquema `auth` de Supabase y los protege Supabase.
- **Cómo:** `scripts/backup.sh` genera un volcado `pg_dump` formato custom, **cifrado con AES-256 (gpg)**, con permisos 600 y suma SHA-256. La clave de cifrado está en un archivo 600 y en el gestor de contraseñas, **nunca junto al respaldo**.
- **Frecuencia (RPO):** semanal como mínimo y siempre antes de `db push --remote`. Pérdida máxima aceptada: 7 días. *(Los respaldos automáticos de Supabase dependen del plan: verificar en el panel y, si existen, sumarlos.)*
- **Retención:** 90 días (`RETENTION_DAYS`). Copia en un segundo lugar (otro disco o nube cifrada) con al menos un respaldo mensual por 12 meses.
- **Programar** (ejemplo cron, domingo 03:00):
  ```
  0 3 * * 0  SUPABASE_DB_URL='…' BACKUP_PASSPHRASE_FILE=$HOME/.contigo-backup-key /ruta/nido/scripts/backup.sh >> $HOME/respaldos-contigo/backup.log 2>&1
  ```
- Los respaldos con datos reales **nunca** se suben a git (`respaldo-*.sql` está en `.gitignore`) ni se usan para pruebas.
- Cada persona también puede descargar sus propios datos desde Ajustes → Respaldo (JSON/CSV).

## 2. Prueba de restauración (cada trimestre)
```
BACKUP_PASSPHRASE_FILE=$HOME/.contigo-backup-key ./scripts/restore-test.sh $HOME/respaldos-contigo/contigo-AAAAMMDD-HHMMSS.dump.gpg
```
Requiere `supabase start` (contenedor `supabase_db_nido`). Verifica la suma, descifra, restaura en una base **temporal**, cuenta filas por tabla, falla si hay errores inesperados y borra la base temporal. Anota fecha, respaldo usado, resultado y tiempo (RTO) abajo.

### Para una recuperación real
1. Detener escrituras (poner la app en mantenimiento o desactivar el proyecto).
2. Restaurar con `pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" archivo.dump` sobre el proyecto (o uno nuevo con las migraciones aplicadas).
3. Correr las suites de `supabase/tests` y las consultas de verificación; reabrir.
4. Registrar el incidente (`04`).

### Registro de pruebas
| Fecha | Respaldo | Resultado | Tiempo | Responsable |
|---|---|---|---|---|
| 2026-11-02 | Base local (17 tablas, 295 gastos) | Correcto | < 1 min | Desarrollo |
| | Primer respaldo de producción | Pendiente | | |

## 3. Continuidad (5.29, 5.30, 8.14)
| Escenario | Efecto | Respuesta | RTO objetivo |
|---|---|---|---|
| Supabase no disponible | Sin datos nuevos; la PWA muestra lo ya cargado y avisa que no hay conexión | Seguir el estado en su página de estado; comunicar si dura más de 1 h | Lo que tarde el proveedor |
| Cloudflare no disponible | App y proxy caídos | Estado de Cloudflare; no hay alternativa inmediata (aceptado, R-10) | Lo que tarde el proveedor |
| Pérdida del proyecto de Supabase | Pérdida de datos | Crear proyecto nuevo, aplicar migraciones, restaurar último respaldo, actualizar secretos del Worker | 4 h |
| Secreto comprometido | Ver `04` | Rotación | 4 h |
| Pérdida de la máquina de desarrollo | Sin despliegue | Clonar desde GitHub, nuevos tokens, `npm ci` | 1 día |
| Pérdida de acceso a una cuenta de plataforma | Sin administración | Códigos de recuperación guardados fuera de línea | 1 día |

Las migraciones y el código están en GitHub, así que la infraestructura se reconstruye desde el repositorio más el último respaldo y los secretos del inventario (`01 §6`).
