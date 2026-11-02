# Contigo (repo `nido`)

PWA de finanzas para hogares de 1 o 2 personas, en español y pesos chilenos. Producción: contigo.dinovance.cl. Maneja **datos financieros reales**: la seguridad y la privacidad van antes que cualquier funcionalidad.

## Estructura
- `web/` — app React 19 + Vite + TypeScript (PWA). Código en `web/src` (`screens`, `components`, `lib`).
- `web/worker/` — Worker de Cloudflare (proxy) con tests (`proxy.test.ts`).
- `supabase/` — `migrations/` (SQL con marca de tiempo), `functions/notify`, `tests/*.sql` (RLS y aislamiento).
- `dinovance-ai/` — servicio Python aparte (aún sin versionar).
- `docs/iso27001/` — marco de seguridad. `SECURITY.md` — política.

## Comandos (ejecutar dentro de `web/`)
- `npm run lint` (oxlint) · `npx tsc -b` · `npm test` (vitest). Esto es lo que corre el CI; debe pasar antes de entregar.
- `npm run build` — compila.
- `npm run test:db` — pruebas SQL de RLS; requiere el contenedor local `supabase_db_nido`.
- `npm run test:e2e` — Playwright; solo si el entorno local está levantado.
- **Nunca** ejecutes `npm run deploy`, `wrangler deploy`, `supabase db push/reset` ni `git push`: despliegue y publicación los hace el humano.

## Reglas
- Ramas: `main` = producción (no tocar), `develop` = integración, `agentes/<tarea>` = trabajo. Trabaja solo en tu rama de tarea.
- Cambios mínimos y acotados; respeta el estilo existente. No refactorices lo que no se pidió.
- Interfaz y textos en español simple, sin jerga financiera.
- Base de datos: toda tabla con RLS. Sueldo, ingresos extra y perfil son **privados** de cada persona (ni la pareja los lee). Un hogar tiene máximo 2 personas. Cambios de esquema = nueva migración, nunca editar una existente.
- Nunca leas ni imprimas `.env*`, `.dev.vars` ni `respaldo-*.sql`. Nunca pongas secretos en el código.
- Los commits siguen el estilo `feat: ...`, `fix: ...`.

## Flujo de agentes
`planner` planifica → `dev` implementa → `qa` prueba (solo edita tests) → `auditor` revisa seguridad (solo lectura). Reporta siempre qué pruebas corriste y su resultado real; si no corriste algo, dilo.
