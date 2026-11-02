# Procedimiento de gestión de incidentes de seguridad

> Versión 1.0 · 2026-11-02. Responsable: responsable de seguridad. Probar con un simulacro al menos una vez al año.

## 1. Cómo se detecta y se informa
- Reporte externo: `SECURITY.md` / `/.well-known/security.txt` (reporte privado en GitHub).
- Alertas de proveedores (Supabase, Cloudflare, GitHub, Google), Dependabot, CI, gitleaks, CodeQL.
- Comportamientos raros: picos en los registros de Auth, errores 429 masivos en el Worker, accesos de administración inesperados en `admin_audit`.
- Cualquier persona del proyecto que sospeche algo avisa **de inmediato** al responsable de seguridad.

## 2. Clasificación
| Nivel | Ejemplos | Plazo de contención |
|---|---|---|
| **Crítico** | Filtración de datos de personas, secreto expuesto, acceso no autorizado a producción | Inmediato (≤ 4 h) |
| **Alto** | Vulnerabilidad explotable sin filtración confirmada, cuenta administradora comprometida | ≤ 24 h |
| **Medio** | Vulnerabilidad que requiere condiciones especiales, ataque de fuerza bruta contenido | ≤ 5 días |
| **Bajo** | Hallazgo informativo, mala configuración sin impacto | Próximo ciclo |

## 3. Respuesta
1. **Registrar** la hora, quién lo detectó y qué se ve (plantilla §7).
2. **Contener:**
   - Secreto expuesto → rotarlo de inmediato (ver inventario en `01 §6`) y revocar el anterior.
   - Cuenta comprometida → `supabase.auth.admin` desde el panel de Supabase: cerrar sesiones y restablecer; quitar de `public.admins` si es administradora.
   - Abuso por la API → bajar el límite del Worker o bloquear la ruta (`web/worker/proxy.ts`) y desplegar.
   - Fallo de aislamiento de datos → desactivar la función o política afectada con una migración de emergencia.
3. **Erradicar:** corregir la causa con una migración o cambio de código, con prueba que reproduzca el fallo (como `supabase/tests/seguridad.sql`).
4. **Recuperar:** restaurar datos desde el respaldo cifrado si hubo pérdida o alteración (`05 §2`); verificar con las suites de pruebas.
5. **Comunicar:**
   - Si hay datos personales comprometidos: avisar a las personas afectadas sin demora injustificada, con qué pasó, qué datos, qué hacer y un contacto.
   - Informar a la autoridad de protección de datos y a los proveedores que corresponda, según la ley aplicable (verificar plazos con asesoría legal).

## 4. Evidencias (5.28)
Conservar, sin modificar: exportación de registros de Supabase Auth y Cloudflare del periodo, `admin_audit`, hash del commit afectado y del desplegado, capturas y la línea de tiempo. Guardarlas cifradas junto al informe del incidente por **24 meses**.

## 5. Después del incidente (5.27)
En ≤ 10 días hábiles: informe con línea de tiempo, causa raíz, impacto, qué funcionó y qué no, acciones correctivas con responsable y fecha. Actualizar el registro de riesgos (`02`) y, si procede, las pruebas.

## 6. Contactos (completar y mantener al día)
| Quién | Para qué | Contacto |
|---|---|---|
| Responsable de seguridad | Dirige la respuesta | |
| Soporte de Supabase | Incidentes de plataforma | Panel de Supabase → Support |
| Soporte de Cloudflare | Worker / Turnstile | Panel de Cloudflare → Support |
| Soporte de Google Cloud | OAuth | Consola de Google Cloud |
| Autoridad de protección de datos y CSIRT nacional | Notificación y apoyo | Completar según la normativa vigente |

## 7. Plantilla de registro
```
ID: INC-AAAA-NNN           Nivel:           Estado: abierto / contenido / cerrado
Detectado: fecha-hora      Por:             Fuente:
Descripción:
Datos o sistemas afectados:
Línea de tiempo:
Contención:                Erradicación:    Recuperación:
Comunicaciones realizadas:
Causa raíz:                Acciones correctivas (responsable, fecha):
```

## Registro de incidentes
| ID | Fecha | Nivel | Resumen | Estado |
|---|---|---|---|---|
| | | | Sin incidentes registrados | |
