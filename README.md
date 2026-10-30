# Contigo

**Tus finanzas, contigo.** Una app web instalable (PWA) para llevar las finanzas de un hogar de **1 o 2 personas**: gastos compartidos, metas de ahorro, deudas, sueldo y avisos. Pensada para parejas, en pesos chilenos y en español.

Producción: <https://contigo.dinovance.cl> · Hecha por Dinovance.

> En el código y en Cloudflare el proyecto aún se llama `nido` / `nido-finanzas`; el nombre de cara a las personas es **Contigo**.

---

## Qué hace

| Pestaña | Para qué sirve |
| --- | --- |
| **Inicio** | Resumen del mes: total gastado, calendario con cada día, gasto por categoría, últimos movimientos, avisos y «Entre ustedes» (quién puso cuánto y cómo se compensan). Se puede ver el hogar completo o solo lo propio. |
| **Registrar** | Teclado numérico para anotar un gasto en segundos: monto, categoría, quién pagó, si es compartido, fecha y nota. |
| **Gastos** | Lista del mes con filtro por persona, edición, categorías propias y un **tope mensual por categoría**. Incluye los **gastos fijos** que se anotan solos cada mes. |
| **Finanzas** | **Sueldo** (privado de cada persona) con calculadora de bruto a líquido para Chile, **ingresos extra**, **deudas** con sus pagos y un **simulador** de cuánto tardas en pagarlas, y proyección de ahorro. |
| **Metas** | Objetivos de ahorro del hogar (un viaje, ahorro para imprevistos…) con aportes de cada persona y su progreso. |
| **Ajustes** | Perfil, hogar e invitación, apariencia (claro/oscuro/automático), contraseña y sesiones, bloqueo de la app, notificaciones, respaldo, guía de bienvenida y salir del hogar o borrar la cuenta. |

Además:

- **Guía de bienvenida** animada de 6 pasos la primera vez que alguien entra; se puede ver otra vez desde Ajustes.
- **Avisos inteligentes**: la app revisa gastos, metas, deudas y sueldo, y avisa cuando algo se sale de lo normal (presupuesto pasado, meta atrasada, deuda que no baja…).
- **Notificaciones push** cuando la pareja anota un gasto o un aporte, y avisos del sistema al abrir la app. Son dos interruptores independientes.
- **Tiempo real**: lo que anota una persona aparece en el teléfono de la otra sin recargar.
- **Instalable** en Android y iPhone, con ícono propio, pantalla completa, atajo «Registrar un gasto» y funcionamiento básico sin conexión.
- **Bloqueo por inactividad** que pide la contraseña (1, 5 o 15 minutos).
- **Respaldo**: descarga de todos los datos del hogar en JSON, y de los gastos en CSV. Se arma en el dispositivo.
- **Lenguaje simple**: «ahorro para imprevistos» en vez de «fondo de emergencia», sin jerga financiera.

### Cómo funciona un hogar

- Un hogar tiene **1 o 2 personas** (lo exige la base de datos).
- Quien crea el hogar genera un **código de invitación** de 12 caracteres, válido 7 días y limitado a 10 intentos por hora; la pareja lo usa al registrarse.
- Cada persona ve **solo su hogar**. El **sueldo, los ingresos extra y el perfil son privados**: ni la pareja puede leerlos.
- Al **salir del hogar** el historial compartido se conserva (para no romper las cuentas de la pareja). Al **borrar la cuenta**, el nombre se anonimiza como «Persona que salió».

### Qué ve cada rol

| | Persona normal | Administrador |
| --- | --- | --- |
| Gastos, metas, finanzas, perfil, hogar, contraseña, bloqueo, respaldo, borrar cuenta | ✅ | ✅ |
| Notificaciones (dos interruptores) | ✅ | ✅ + botón «Enviar prueba» |
| Instalación y conexión, Seguridad de Contigo | — | ✅ |
| Panel de administración (conteos agregados, limpieza de hogares) | — | ✅ (exige segundo factor) |

---

## Arquitectura

```
 Navegador (PWA React)
        │  solo habla con /supabase/…  del mismo sitio
        ▼
 Cloudflare Worker  ── proxy filtrado, límites por IP, sin exponer el proyecto real
        │  añade la dirección y la clave reales (secretos del Worker)
        ▼
 Supabase  ── Auth (correo + CAPTCHA + MFA admin) · Postgres con RLS · Realtime · Edge Function «notify»
```

- **Front** (`web/`): React 19 + TypeScript + Vite 8, instalable con `vite-plugin-pwa`. Sin librerías de UI ni de animación: los estilos y las animaciones son CSS propio. Tipografías Bricolage Grotesque y DM Sans.
- **Proxy** (`web/worker/`): un Cloudflare Worker sirve los archivos estáticos y atiende solo `/supabase/*`. Solo deja pasar `auth`, `rest`, `realtime` y `notify`; rechaza otros orígenes, aplica límites por IP (más estrictos en login y registro) y topa cada petición en 1 MB. Detalle en [`web/worker/README.md`](web/worker/README.md).
- **Base de datos** (`supabase/`): Postgres con **seguridad por fila (RLS)** en todas las tablas. La protección real vive ahí; el proxy es una capa extra.
- **Notificaciones** (`supabase/functions/notify`): Edge Function (Deno) que envía Web Push a la pareja.
- **Tiempo real**: canales privados de Supabase Realtime por hogar y por usuario; la app refresca solo los grupos de datos que cambiaron.

### Estructura del repositorio

```
.
├── supabase/
│   ├── config.toml        configuración local (CAPTCHA de prueba, contraseña mínima de 10, confirmación de correo)
│   ├── migrations/        esquema, RLS, funciones y panel admin, en orden
│   ├── functions/notify/  envío de notificaciones push
│   ├── templates/         correos de confirmación y recuperación de contraseña
│   └── tests/             pruebas SQL: rls, hogares, admin y aislamiento
└── web/
    ├── src/
    │   ├── App.tsx, Shell.tsx   sesión, carga del hogar y navegación por pestañas
    │   ├── screens/             Home, Register, Expenses, Money, Goals, Security (Ajustes), Admin, Auth…
    │   ├── components/          tarjetas, gráficos, Tour (guía), Spin (carga), instalación…
    │   └── lib/                 datos, motor de avisos, finanzas, cálculo de sueldo de Chile, push, respaldo…
    ├── worker/                  proxy de Supabase para Cloudflare
    ├── e2e/e2e.cjs              prueba de punta a punta con Chrome
    └── public/                  íconos, service worker de push, robots.txt, sitemap.xml, imagen para compartir
```

### Modelo de datos (resumen)

`households` · `members` (1–2 activos por hogar, con `left_at` para el historial) · `categories` (con tope mensual) · `expenses` · `recurring_expenses` · `goals` y `contributions` · `debts` y `debt_payments` · `salaries` e `incomes` (privados por persona) · `profiles` · `push_subscriptions` · `invite_attempts` · `admins` y `admin_audit` (registro de acciones destructivas del panel). Los montos son **pesos chilenos enteros** (`bigint`).

---

## Seguridad y privacidad

- **Cuenta**: correo confirmado, contraseña de al menos 10 caracteres (se rechazan las obvias) y CAPTCHA de Cloudflare Turnstile al registrarse, entrar o recuperar la contraseña.
- **Acciones delicadas** (cambiar contraseña, salir del hogar, borrar la cuenta) vuelven a pedir la contraseña actual.
- **Aislamiento**: cada fila pertenece a un hogar y la base solo la entrega a sus miembros. Hay pruebas SQL específicas de aislamiento, incluida una de mutación.
- **Panel de administración**: la lista de administradores vive en la tabla `admins`; todas las funciones `admin_*` exigen sesión con segundo factor (TOTP) y devuelven solo conteos y referencias opacas, sin nombres, correos ni montos.
- **Proxy**: el navegador nunca ve la dirección ni la clave reales del proyecto de Supabase (un plugin de Vite comprueba en el build que no se filtren).
- **Sin publicidad ni seguimiento**. Los datos viajan por HTTPS y se pueden descargar o borrar por completo.

---

## Desarrollo local

Requisitos: Node.js reciente (el proyecto usa tipos de Node 24), Docker, la [CLI de Supabase](https://supabase.com/docs/guides/cli) y Google Chrome (solo para el e2e).

```bash
# 1. Supabase local (Postgres, Auth, Realtime, Mailpit para los correos)
supabase start

# 2. Front
cd web
npm install
npm run dev            # http://localhost:5173
```

`web/.env.local` apunta al Supabase local:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_KEY=<clave publicable local>
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA   # clave de prueba: siempre aprueba
```

En desarrollo no hace falta el Worker: `npm run dev` reenvía `/supabase` al proyecto de `.env.local`. Los correos de confirmación llegan a Mailpit (<http://127.0.0.1:54324>).

Para confirmar una cuenta a mano en local:

```bash
docker exec supabase_db_nido psql -U postgres -c \
  "update auth.users set email_confirmed_at = now() where email = 'alguien@correo.cl';"
```

### Scripts (`web/`)

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga. |
| `npm run build` | `tsc -b` y build de producción con PWA. |
| `npm test` | Pruebas unitarias (Vitest): finanzas, motor de avisos, sueldo de Chile, respaldo, paginación, proxy… |
| `npm run lint` | Oxlint. |
| `npm run test:db` | Pruebas SQL contra el Postgres local (RLS, hogares, admin, aislamiento). |
| `npm run test:db:mutacion` | Mutación del aislamiento: comprueba que las pruebas detectan una RLS rota. |
| `npm run test:e2e` | Recorrido completo con Chrome real: registro, hogar, invitación, tiempo real, gastos fijos, salir y borrar cuenta. Requiere `supabase start` y `npm run dev` en `127.0.0.1:5173`. |
| `npm run deploy` | Build y despliegue al Worker de Cloudflare. |

---

## Despliegue

### 1. Base de datos (Supabase)

```bash
supabase link --project-ref <tu-proyecto>
supabase db push                          # aplica las migraciones
supabase functions deploy notify          # notificaciones push
```

En el panel de Supabase: pega las plantillas de `supabase/templates/` en *Authentication → Email Templates*, activa el CAPTCHA de Turnstile con la clave **secreta**, y confirma que las confirmaciones de correo estén activas.

### 2. Worker (Cloudflare)

Una sola vez, los secretos del proxy:

```bash
cd web
npx wrangler login
npx wrangler secret put SUPABASE_ORIGIN   # https://<tu-proyecto>.supabase.co
npx wrangler secret put SUPABASE_KEY      # clave publicable (sb_publishable_…)
```

Y las variables públicas del build en `web/.env.production.local` (no se sube a git; ejemplo en `.env.production.example`):

```
VITE_VAPID_PUBLIC_KEY=...        # clave pública de las notificaciones push
VITE_TURNSTILE_SITE_KEY=...      # clave de SITIO de Turnstile (la secreta va en Supabase)
```

### 3. Publicar

```bash
cd web
npm test && npm run build
npm run deploy
```

El dominio `contigo.dinovance.cl` lo crea Cloudflare solo al desplegar (`wrangler.jsonc`). Después de cada versión, quienes tienen la app instalada la reciben al cerrarla y abrirla de nuevo; también pueden usar *Ajustes → Acerca de → Buscar actualizaciones*.

### Hacer administrador a una cuenta

El administrador es una fila de la tabla `admins` (la migración `20261023120000_admin_endurecido.sql` registra una cuenta concreta por su correo). Para sumar otra, inserta su `user_id` en `admins` desde el SQL Editor de Supabase. Para abrir el panel necesita activar el segundo factor (TOTP).

---

## Cálculo de sueldo en Chile

La calculadora de bruto a líquido (`web/src/lib/chile.ts`) descuenta AFP (con la comisión de cada administradora), salud, seguro de cesantía e impuesto de segunda categoría, o la retención de honorarios si es independiente. Los valores (UTM, UF, topes imponibles, comisiones) están al día a **octubre de 2026** y **hay que revisarlos a mano al menos una vez al año** o cuando cambie alguna ley. Es una estimación para orientarse, no reemplaza una liquidación de sueldo.

---

## Licencia y créditos

© 2026 Dinovance. Todos los derechos reservados. Instagram: [@dinovance.cl](https://www.instagram.com/dinovance.cl).
