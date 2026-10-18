-- Sueldo (privado por persona) y deudas del hogar con sus pagos.
-- Montos en pesos chilenos enteros (bigint).

-- ---------- Sueldo: SOLO lo ve su dueño, ni siquiera la pareja ----------
create table public.salaries (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  amount       bigint not null check (amount >= 0 and amount < 10000000000),
  pay_day      int not null default 1 check (pay_day between 1 and 31),
  updated_at   timestamptz not null default now(),
  foreign key (household_id, user_id) references public.members (household_id, user_id) on delete cascade
);

revoke all on public.salaries from anon, authenticated;
grant select, insert on public.salaries to authenticated;
grant update (amount, pay_day, updated_at) on public.salaries to authenticated;
grant delete on public.salaries to authenticated;

alter table public.salaries enable row level security;
create policy salaries_select on public.salaries
  for select to authenticated using (user_id = auth.uid());
create policy salaries_insert on public.salaries
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(household_id));
create policy salaries_update on public.salaries
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy salaries_delete on public.salaries
  for delete to authenticated using (user_id = auth.uid());

-- ---------- Deudas del hogar ----------
create table public.debts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  kind            text not null default 'otro' check (kind in ('tarjeta', 'credito', 'prestamo', 'otro')),
  -- null = de los dos; si no, de quien figura como titular
  owner_id        uuid,
  original_amount bigint not null check (original_amount > 0 and original_amount < 10000000000),
  monthly_payment bigint not null default 0 check (monthly_payment >= 0 and monthly_payment < 10000000000),
  -- interés mensual en %, por ejemplo 2.5
  monthly_rate    numeric(5, 2) not null default 0 check (monthly_rate >= 0 and monthly_rate <= 30),
  due_day         int check (due_day is null or due_day between 1 and 31),
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (id, household_id),
  foreign key (household_id, owner_id) references public.members (household_id, user_id)
);

create table public.debt_payments (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  debt_id      uuid not null,
  amount       bigint not null check (amount > 0 and amount < 10000000000),
  paid_by      uuid not null,
  paid_on      date not null default ((now() at time zone 'America/Santiago')::date),
  created_at   timestamptz not null default now(),
  foreign key (debt_id, household_id) references public.debts (id, household_id) on delete cascade,
  foreign key (household_id, paid_by) references public.members (household_id, user_id)
);

create index debts_household_idx on public.debts (household_id);
create index debt_payments_debt_idx on public.debt_payments (debt_id);
create index debt_payments_household_date_idx on public.debt_payments (household_id, paid_on desc);

revoke all on public.debts, public.debt_payments from anon, authenticated;
grant select, insert, delete on public.debts to authenticated;
grant update (name, kind, owner_id, original_amount, monthly_payment, monthly_rate, due_day, archived)
  on public.debts to authenticated;
grant select, insert, delete on public.debt_payments to authenticated;

alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

create policy debts_select on public.debts
  for select to authenticated using (public.is_member(household_id));
create policy debts_insert on public.debts
  for insert to authenticated with check (public.is_member(household_id));
create policy debts_update on public.debts
  for update to authenticated using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy debts_delete on public.debts
  for delete to authenticated using (public.is_member(household_id));

create policy debt_payments_select on public.debt_payments
  for select to authenticated using (public.is_member(household_id));
create policy debt_payments_insert on public.debt_payments
  for insert to authenticated with check (public.is_member(household_id));
create policy debt_payments_delete on public.debt_payments
  for delete to authenticated using (public.is_member(household_id));

-- Tiempo real (respeta RLS: el sueldo de uno nunca llega al otro)
alter table public.debts replica identity full;
alter table public.debt_payments replica identity full;
alter table public.salaries replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.debts, public.debt_payments, public.salaries;
  end if;
end;
$$;
