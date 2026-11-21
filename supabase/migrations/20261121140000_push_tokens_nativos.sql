-- Copyright (c) 2026 Dinovance
-- ---------------------------------------------------------------------------------------------
-- DEC-04: tokens de push nativos (FCM) por dispositivo. Tabla aparte: push_subscriptions queda intacta
-- (convivencia con Web Push mientras exista la PWA). El emisor está en functions/notify/fcm.ts y se
-- mantiene desactivado mientras no exista el secreto FCM_SERVICE_ACCOUNT_JSON (y la app, google-services.json).
-- ---------------------------------------------------------------------------------------------

create table public.native_push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token      text not null unique check (char_length(token) between 20 and 4096 and token ~ '^[A-Za-z0-9_:.-]+$'),
  platform   text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now()
);
create index native_push_tokens_user_idx on public.native_push_tokens (user_id);

revoke all on public.native_push_tokens from public, anon, authenticated;
grant select, insert, delete on public.native_push_tokens to authenticated;
grant select, delete on public.native_push_tokens to service_role;

alter table public.native_push_tokens enable row level security;
create policy native_tokens_select on public.native_push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy native_tokens_insert on public.native_push_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy native_tokens_delete on public.native_push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- Tope de 10 dispositivos por persona: un token robado no puede inundar la tabla
create function public.native_push_tokens_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.native_push_tokens where user_id = new.user_id) >= 10 then
    raise exception 'Demasiados dispositivos registrados' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function public.native_push_tokens_limit() from public, anon, authenticated;
create trigger native_push_tokens_limit
  before insert on public.native_push_tokens
  for each row execute function public.native_push_tokens_limit();
