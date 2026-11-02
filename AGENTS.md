# Contigo (repo `nido`)

PWA de finanzas para hogares de 1 o 2 personas, en español y pesos chilenos. Producción: contigo.dinovance.cl. Maneja **datos financieros reales**: la seguridad y la privacidad van antes que cualquier funcionalidad.

## REGLA DE ORO: SOLO LOCAL, NUNCA PRODUCCIÓN
- Todo se trabaja y prueba en este equipo: `npm --prefix web run dev`, Supabase local (contenedor `supabase_db_nido`), tests.
- Prohibido para agentes: desplegar (`wrangler`, `npm run deploy`), tocar el Supabase real (`db push`, `--linked`, `--remote`, `functions deploy`, `secrets`, `link`, `login`), `git push`, `gh`, `curl`/`wget`, contactar `contigo.dinovance.cl` o `*.supabase.co`, usar `SUPABASE_DB_URL`, correr `scripts/backup.sh`, o leer `.env*`/respaldos.
- Una migración nueva solo se crea como archivo y se prueba en la base local. Aplicarla en producción lo hace el humano, a mano, fuera de OpenCode.
- Si una tarea parece requerir producción, el agente se detiene y lo dice.

## Estructura
- `web/` — app React 19 + Vite + TypeScript (PWA). Código en `web/src` (`screens`, `components`, `lib`).
- `web/worker/` — Worker de Cloudflare (proxy) con tests (`proxy.test.ts`).
- `supabase/` — `migrations/` (SQL con marca de tiempo), `functions/notify`, `tests/*.sql` (RLS y aislamiento).
- `dinovance-ai/` — servicio Python aparte (aún sin versionar).
- `docs/iso27001/` — marco de seguridad. `SECURITY.md` — política.

## Verificación local
`bash scripts/verificar.sh` corre lint, tsc, tests unitarios y pruebas SQL locales y imprime líneas `RESULTADO ...`. Es la forma estándar de comprobar un cambio; los agentes copian su salida literal.

## Comandos sueltos (desde la RAÍZ del repo con `--prefix web`)
- `npm --prefix web run lint` (oxlint) · `npm --prefix web exec -- tsc -b web` · `npm --prefix web test` (vitest). Esto es lo que corre el CI; debe pasar antes de entregar.
- `npm --prefix web run build` — compila.
- `npm --prefix web run test:db` — pruebas SQL de RLS; requiere el contenedor local `supabase_db_nido`.
- `npm --prefix web run test:e2e` — Playwright; solo si el entorno local está levantado.
- **Nunca** ejecutes `npm run deploy`, `wrangler deploy`, `supabase db push/reset` ni `git push`: despliegue y publicación los hace el humano.

## Reglas
- Ramas: `main` = producción (no tocar), `develop` = integración, `agentes/<tarea>` = trabajo. Trabaja solo en tu rama de tarea.
- Cambios mínimos y acotados; respeta el estilo existente. No refactorices lo que no se pidió.
- Interfaz y textos en español simple, sin jerga financiera.
- Base de datos: toda tabla con RLS. Sueldo, ingresos extra y perfil son **privados** de cada persona (ni la pareja los lee). Un hogar tiene máximo 2 personas. Cambios de esquema = nueva migración, nunca editar una existente.
- Nunca leas ni imprimas `.env*`, `.dev.vars` ni `respaldo-*.sql`. Nunca pongas secretos en el código.
- Los commits siguen el estilo `feat: ...`, `fix: ...`.

## Flujo de agentes
El humano coordina: ningún agente llama a otro. Se elige con Tab. Un paso pequeño por vez; entre pasos el humano revisa `git diff`.
`planner` planifica → `dev` implementa → `qa` prueba (solo edita tests) → `auditor` revisa seguridad (solo lectura). Reporta siempre qué pruebas corriste y su resultado real; si no corriste algo, dilo.

## Reglas de honestidad
- Reporta solo lo verificado en la sesión: archivos cambiados (`git status`), comandos corridos y su resultado real, y lo que NO se hizo.
- No escribas "completado" ni "tests pasan" sin haberlo comprobado.
- Antes de crear algo, busca si ya existe (p. ej. los gastos ya tienen `note`).
- SQL nuevo solo en `supabase/migrations/` como migración nueva; nunca en `supabase/functions/`.

## Cómo se escriben los tests aquí
- Vitest, archivos `*.test.ts` junto al módulo (`web/src/lib`). Sigue el estilo de `numbers.test.ts`.
- Las fechas se prueban pasando una fecha explícita (`new Date(2026, 9, 15)`) a la función. NO se mockea el reloj ni se usa `global`/`globalThis`; para funciones sin parámetro (`todayISO`) basta comprobar el formato.
- Si un test queda con errores de `tsc` o falla dos veces, bórralo o simplifícalo y repórtalo; no lo dejes roto.
