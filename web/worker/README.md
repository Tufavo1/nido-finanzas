# Proxy de Supabase

El navegador solo habla con `/supabase/...` de este mismo sitio. El Worker ([index.ts](index.ts)) reenvía
a Supabase con la dirección y la clave reales, que son **secretos del Worker** y no están en el código
que se descarga ni en git.

## Puesta en marcha (una vez)

```
cd web
npx wrangler secret put SUPABASE_ORIGIN   # https://TU-PROYECTO.supabase.co  (sin barra final)
npx wrangler secret put SUPABASE_KEY      # la clave publicable (sb_publishable_…)
npm run deploy
```

Desarrollo: no hace falta Worker. `npm run dev` reenvía `/supabase` al Supabase de `.env.local`
(`VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`, que ya no se incluyen en el código del navegador).

## Qué hace el proxy

- Solo deja pasar `auth`, `rest` (tablas y funciones), `realtime` y la función `notify`. Bloquea el esquema
  de la API, `auth/admin`, storage, graphql y cualquier ruta rara.
- Rechaza peticiones de otros orígenes (`Origin` / `Sec-Fetch-Site`).
- Límite por IP (más estricto en login, registro y recuperación) y tope de 1 MB por petición.
- Reenvía solo los encabezados necesarios; no pasa cookies ni `Referer`.
- Responde sin cookies, sin caché y sin pistas del servidor real; los errores no revelan la dirección.

## Límites que conviene saber

- La clave publicable y la dirección **no son secretos criptográficos**: la protección real sigue siendo RLS
  en la base de datos. El proxy es una capa extra (filtro, límites, no exponer el proyecto).
- Los correos de Supabase (confirmación, recuperar contraseña) siguen llevando el enlace a `*.supabase.co`;
  eso solo cambia con un dominio personalizado de Supabase (plan de pago).
- Cualquiera que conozca la dirección real puede llamar a Supabase directo, con las mismas reglas RLS de siempre.
