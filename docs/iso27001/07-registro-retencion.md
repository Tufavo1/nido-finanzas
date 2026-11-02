# Clasificación, registros y retención de datos

> Versión 1.0 · 2026-11-02.

## 1. Clasificación de la información (5.12, 5.13)
| Clase | Qué incluye | Tratamiento |
|---|---|---|
| **Confidencial** | Datos financieros de personas (sueldos, deudas, gastos, metas), correos, sesiones, secretos, respaldos | RLS, TLS, solo acceso mínimo; respaldos cifrados; nunca en git, chats ni capturas públicas |
| **Interna** | Código fuente, migraciones, documentación de seguridad, registros | Repositorio privado o con acceso controlado; sin secretos |
| **Pública** | Sitio web, política de privacidad y términos, `SECURITY.md`, `security.txt` | Sin datos de personas |

## 2. Registros y monitoreo (8.15, 8.16, 5.33)
| Registro | Dónde | Qué contiene | Retención | Quién lo revisa y cuándo |
|---|---|---|---|---|
| Autenticación | Supabase → Logs → Auth | Inicios de sesión, fallos, recuperaciones, MFA | Según plan de Supabase (verificar); exportar mensualmente si es menor a 12 meses | Responsable de seguridad, **mensual** |
| API y base de datos | Supabase → Logs | Errores y consultas lentas | Según plan | Mensual |
| Worker | Cloudflare → Workers → Logs / Analytics | Errores, 429 (límite), 403 (origen) | Según plan | Mensual y ante alertas |
| Acciones de administración | `public.admin_audit` | Quién hizo qué en el panel, incluida cada consulta de la lista de hogares (`view_households`, nombres de hogar y de personas; una vez cada 10 minutos por administrador) | Mientras exista la cuenta administradora + 24 meses | Mensual |
| CI y seguridad | GitHub Actions / Security | Pruebas, `audit`, gitleaks, CodeQL | Según GitHub | En cada PR y semanal |
| Incidentes | `04-incidentes.md` y carpeta de evidencias cifrada | Ver `04 §4` | 24 meses | Anual |

**Checklist mensual** (anotar fecha y resultado): picos de inicios fallidos o de 429; accesos de administración inesperados; errores 5xx repetidos; nuevos PR de Dependabot pendientes; alertas de CodeQL/gitleaks abiertas; usuarios de las plataformas que ya no deberían tener acceso.

Los registros no contienen contraseñas ni montos de las personas. Quien los consulta no los copia fuera de los sistemas del proveedor, salvo para un incidente (cifrados).

## 3. Retención de datos personales (5.33, 5.34, 8.10)
| Dato | Retención | Cómo se borra |
|---|---|---|
| Cuenta, perfil y datos del hogar | Mientras la persona use el servicio | Ajustes → Borrar mi cuenta (`delete_account`); si queda sola, se borra el hogar completo |
| Salir de un hogar con pareja | Los gastos compartidos quedan en el historial de la otra persona con el nombre de quien salió; lo personal se borra | `leave_household` |
| Suscripciones push | Hasta que se desactiven o la cuenta se borre; endpoints inválidos se limpian | Ajustes → Notificaciones |
| Respaldos del proyecto | 90 días (mensual hasta 12 meses) | `backup.sh` (rotación automática) |
| Registros técnicos | Ver §2 | Según proveedor |

**Pendiente de decisión de la dirección:** plazo para cuentas inactivas (propuesta: aviso a los 24 meses sin ingresar y borrado a los 27, con implementación y mención en la política de privacidad antes de activarlo). Hasta entonces **no se borran cuentas por inactividad**.
Los respaldos pueden conservar datos de cuentas ya borradas hasta que se roten (≤ 90 días): informarlo en la política de privacidad.

## 4. Marco legal (5.31, 5.34) — verificar con asesoría legal
La app trata datos personales de personas en Chile: ley de protección de la vida privada vigente y su actualización (Ley 19.628 y Ley 21.719, con sus plazos de entrada en vigor). Mantener: base de licitud (consentimiento aceptado y versionado al registrarse), derechos de acceso, rectificación, supresión y portabilidad (Respaldo en Ajustes, borrado de cuenta), seguridad y notificación de brechas (`04`).
