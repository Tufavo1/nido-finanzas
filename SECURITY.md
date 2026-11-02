# Política de seguridad

## Cómo informar una vulnerabilidad

Si encontraste un problema de seguridad en Contigo, **no lo publiques**. Repórtalo en privado:

- GitHub: <https://github.com/Tufavo1/nido-finanzas/security/advisories/new> (reporte privado de vulnerabilidades).
- El mismo enlace está en `https://contigo.dinovance.cl/.well-known/security.txt`.

Incluye qué pasa, cómo reproducirlo y qué impacto crees que tiene. Evita acceder a datos de otras personas, degradar el servicio o usar ataques de fuerza bruta; con una prueba mínima basta.

## Qué esperar

- Acuse de recibo en **3 días hábiles**.
- Evaluación y primera respuesta en **10 días hábiles**.
- Las vulnerabilidades críticas se corrigen primero; avisamos cuando estén resueltas y, si quieres, te reconocemos.

## Alcance

`contigo.dinovance.cl`, su Worker de Cloudflare, el proyecto de Supabase y el código de este repositorio. Fuera de alcance: ingeniería social, ataques físicos, denegación de servicio y hallazgos en servicios de terceros (repórtalos a cada proveedor).

## Versiones con soporte

Solo la versión en producción (rama `main`).

El marco de gestión de seguridad del proyecto está en [`docs/iso27001`](docs/iso27001/README.md).
