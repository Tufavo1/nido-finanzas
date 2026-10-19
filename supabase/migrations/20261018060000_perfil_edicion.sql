-- Perfil (profesión) y permisos para poder corregir aportes y pagos de deudas.

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  profession   text not null default '' check (char_length(profession) <= 60),
  employment   text not null default 'dependiente'
    check (employment in ('dependiente', 'independiente', 'honorarios', 'estudiante', 'otro')),
  dependents   int not null default 0 check (dependents between 0 and 10),
  updated_at   timestamptz not null default now(),
  foreign key (household_id, user_id) references public.members (household_id, user_id) on delete cascade
);

revoke all on public.profiles from anon, authenticated;
grant select, insert, delete on public.profiles to authenticated;
grant update (profession, employment, dependents, updated_at) on public.profiles to authenticated;

alter table public.profiles enable row level security;
-- La profesión no es sensible: la ven los dos del hogar. El sueldo sigue siendo solo de su dueño.
create policy profiles_select on public.profiles
  for select to authenticated using (public.is_member(household_id));
create policy profiles_insert on public.profiles
  for insert to authenticated with check (user_id = auth.uid() and public.is_member(household_id));
create policy profiles_update on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete on public.profiles
  for delete to authenticated using (user_id = auth.uid());

-- Corregir aportes a metas y pagos de deudas
grant update (amount, contributed_on) on public.contributions to authenticated;
create policy contributions_update on public.contributions
  for update to authenticated using (public.is_member(household_id))
  with check (public.is_member(household_id));

grant update (amount, paid_on) on public.debt_payments to authenticated;
create policy debt_payments_update on public.debt_payments
  for update to authenticated using (public.is_member(household_id))
  with check (public.is_member(household_id));

alter table public.profiles replica identity full;
alter table public.contributions replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
