create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant update (p256dh, auth_key) on public.push_subscriptions to authenticated;
grant select, delete on public.push_subscriptions to service_role;

alter table public.push_subscriptions enable row level security;
create policy push_subs_select on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy push_subs_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy push_subs_update on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subs_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());