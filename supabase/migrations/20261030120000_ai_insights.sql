create table public.ai_insights (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete cascade,
  tipo         text not null check (tipo in ('hogar', 'personal')),
  periodo      text not null check (periodo ~ '^\d{4}-\d{2}$'),
  perfil       jsonb not null,
  resultado    jsonb not null,
  modelo       text not null,
  created_at   timestamptz not null default now(),
  check ((tipo = 'hogar' and user_id is null) or (tipo = 'personal' and user_id is not null))
);

create index ai_insights_hogar_idx on public.ai_insights (household_id, tipo, periodo desc);
create index ai_insights_user_idx  on public.ai_insights (user_id, periodo desc);

-- La app solo LEE. Escribe únicamente el script con service_role.
revoke all on public.ai_insights from anon, authenticated;
grant select on public.ai_insights to authenticated;

alter table public.ai_insights enable row level security;
create policy ai_insights_select on public.ai_insights
  for select to authenticated
  using (
    public.is_member(household_id)
    and (tipo = 'hogar' or user_id = (select auth.uid()))
  );
