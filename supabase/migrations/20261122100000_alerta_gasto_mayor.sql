-- Copyright (c) 2026 Dinovance
-- Aviso «Tu pareja hizo un gasto mayor»: preferencia POR PERSONA (apagada por defecto) con umbral propio en CLP.
-- Cada quien solo ve y cambia la suya (RLS). Se escribe por la RPC set_big_spend_alert (valida rango); la funcion
-- `notify` (service_role) la lee para decidir el titulo. Idempotente.

create table if not exists public.big_spend_alert_prefs (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled       boolean not null default false,
  threshold_clp bigint not null default 50000 check (threshold_clp >= 1 and threshold_clp < 10000000000),
  updated_at    timestamptz not null default now()
);

revoke all on public.big_spend_alert_prefs from public, anon, authenticated;
grant select on public.big_spend_alert_prefs to authenticated;
grant select on public.big_spend_alert_prefs to service_role;
alter table public.big_spend_alert_prefs enable row level security;
alter table public.big_spend_alert_prefs force row level security;

drop policy if exists big_spend_prefs_select on public.big_spend_alert_prefs;
create policy big_spend_prefs_select on public.big_spend_alert_prefs
  for select to authenticated using (user_id = auth.uid());

-- Sin INSERT/UPDATE/DELETE directos: solo la RPC (que fija user_id = auth.uid()).
create or replace function public.set_big_spend_alert(p_enabled boolean, p_threshold_clp bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Requiere sesión' using errcode = '42501';
  end if;
  if p_enabled is null or p_threshold_clp is null or p_threshold_clp < 1 or p_threshold_clp >= 10000000000 then
    raise exception 'Preferencia inválida' using errcode = '22023';
  end if;
  insert into public.big_spend_alert_prefs (user_id, enabled, threshold_clp, updated_at)
  values (auth.uid(), p_enabled, p_threshold_clp, now())
  on conflict (user_id) do update set enabled = excluded.enabled, threshold_clp = excluded.threshold_clp, updated_at = now();
end;
$$;
revoke all on function public.set_big_spend_alert(boolean, bigint) from public, anon;
grant execute on function public.set_big_spend_alert(boolean, bigint) to authenticated;
