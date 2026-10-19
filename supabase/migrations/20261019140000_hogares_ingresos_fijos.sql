-- Nido · Hogares de 1 o 2 personas bien aislados, salir del hogar / borrar cuenta,
-- ingresos extra y gastos fijos. Solo agrega: no borra datos existentes.

-- =====================================================================
-- 1. Membresía activa y ex-miembros
-- Al salir de un hogar compartido, la fila queda como historial (left_at) para que los gastos
-- de esa persona sigan a su nombre; ya no da acceso a nada. Se puede entrar a otro hogar.
-- =====================================================================
alter table public.members add column left_at timestamptz;
alter table public.members drop constraint members_user_id_key;
create unique index members_one_active_household on public.members (user_id) where left_at is null;
-- El historial sobrevive al borrado de la cuenta (delete_account limpia todo lo privado)
alter table public.members drop constraint members_user_id_fkey;

create or replace function public.is_member(h uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = h and m.user_id = (select auth.uid()) and m.left_at is null
  );
$$;

-- Hogar activo de quien llama (null si no tiene)
create function public.my_household()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.household_id from public.members m
  where m.user_id = (select auth.uid()) and m.left_at is null;
$$;

drop policy members_update_self on public.members;
create policy members_update_self on public.members for update to authenticated
  using (user_id = (select auth.uid()) and left_at is null)
  with check (user_id = (select auth.uid()) and left_at is null);

-- Tope duro: máximo 2 personas activas por hogar, lo haga quien lo haga
create function public.members_limit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.left_at is not null then
    return new;
  end if;
  perform 1 from public.households where id = new.household_id for update;
  if (select count(*) from public.members
      where household_id = new.household_id and left_at is null and user_id <> new.user_id) >= 2 then
    raise exception 'Un hogar admite como máximo 2 personas' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger members_limit before insert or update of left_at on public.members
for each row execute function public.members_limit();

-- =====================================================================
-- 2. Invitaciones: más azar, vencen en 7 días y máximo 10 intentos por hora
-- =====================================================================
alter table public.households add column invite_expires_at timestamptz;
update public.households set invite_expires_at = now() + interval '7 days' where invite_code is not null;

create table public.invite_attempts (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index invite_attempts_user_idx on public.invite_attempts (user_id, at);
revoke all on public.invite_attempts from anon, authenticated;
alter table public.invite_attempts enable row level security;

-- 12 caracteres de un alfabeto de 32 sin 0/O/1/I (60 bits). Con el límite de intentos es imposible adivinarlo.
create function public.new_invite_code()
returns text
language sql volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(r.b, i) % 32 + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(12) as b) r, generate_series(0, 11) as i;
$$;

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if public.my_household() is not null then
    raise exception 'Ya perteneces a un hogar';
  end if;

  insert into public.households (name, invite_code, invite_expires_at)
  values (trim(p_name), public.new_invite_code(), now() + interval '7 days')
  returning id into v_id;

  insert into public.members (household_id, user_id, display_name, color)
  values (v_id, v_uid, trim(p_display_name), 'blue');

  insert into public.categories (household_id, name, position)
  select v_id, t.n, t.o
  from unnest(array['Supermercado', 'Hogar y cuentas', 'Transporte', 'Salud', 'Ocio', 'Otros'])
       with ordinality as t(n, o);

  return v_id;
end;
$$;

-- Devuelve null (sin error) si el código no sirve, para que el intento quede registrado
create or replace function public.join_household(p_code text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_h     uuid;
  v_color text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if public.my_household() is not null then
    raise exception 'Ya perteneces a un hogar';
  end if;
  delete from public.invite_attempts a where a.at < now() - interval '1 day';
  if (select count(*) from public.invite_attempts a
      where a.user_id = v_uid and a.at > now() - interval '1 hour') >= 10 then
    raise exception 'Demasiados intentos. Espera una hora e inténtalo de nuevo.';
  end if;
  insert into public.invite_attempts (user_id) values (v_uid);

  select h.id into v_h
    from public.households h
   where h.invite_code = upper(replace(trim(p_code), ' ', ''))
     and h.invite_expires_at > now()
   for update;
  if v_h is null
     or (select count(*) from public.members where household_id = v_h and left_at is null) >= 2 then
    return null;
  end if;

  select case when bool_or(color = 'blue') then 'amber' else 'blue' end into v_color
    from public.members where household_id = v_h and left_at is null;

  -- Si ya estuvo en este hogar, se reactiva su fila (y su historial)
  update public.members
     set left_at = null, display_name = trim(p_display_name), color = v_color, joined_at = now()
   where household_id = v_h and user_id = v_uid;
  if not found then
    insert into public.members (household_id, user_id, display_name, color)
    values (v_h, v_uid, trim(p_display_name), v_color);
  end if;

  update public.households set invite_code = null, invite_expires_at = null where id = v_h;
  return v_h;
end;
$$;

create or replace function public.rotate_invite_code()
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_h    uuid := public.my_household();
  v_code text;
begin
  if v_h is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  perform 1 from public.households where id = v_h for update;
  if (select count(*) from public.members where household_id = v_h and left_at is null) >= 2 then
    raise exception 'El hogar ya está completo';
  end if;
  v_code := public.new_invite_code();
  update public.households
     set invite_code = v_code, invite_expires_at = now() + interval '7 days'
   where id = v_h;
  return v_code;
end;
$$;

create or replace function public.create_widget_token(p_label text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_h     uuid := public.my_household();
  v_token text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if v_h is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  if (select count(*) from public.widget_tokens where household_id = v_h) >= 5 then
    raise exception 'Máximo 5 widgets activos. Revoca alguno primero.';
  end if;

  v_token := 'nw_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.widget_tokens (household_id, label, token_hash, created_by)
  values (v_h, trim(p_label), encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid);
  return v_token;
end;
$$;

-- Widget: los ex-miembros solo aparecen si gastaron algo este mes
create or replace function public.widget_summary(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_h     uuid;
  v_start date;
  v_end   date;
  v_today date;
begin
  select household_id into v_h
  from public.widget_tokens
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if v_h is null then
    raise exception 'Token inválido' using errcode = '28000';
  end if;

  v_today := (now() at time zone 'America/Santiago')::date;
  v_start := date_trunc('month', v_today)::date;
  v_end   := (v_start + interval '1 month')::date;

  return jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'spent', coalesce((select sum(amount) from public.expenses
                       where household_id = v_h and spent_on >= v_start and spent_on < v_end), 0),
    'budget', coalesce((select sum(monthly_budget) from public.categories
                        where household_id = v_h and not archived), 0),
    'days_left', (v_end - 1) - v_today,
    'by_member', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', m.display_name, 'color', m.color, 'spent', coalesce(s.total, 0))
             order by m.joined_at)
      from public.members m
      left join (select paid_by, sum(amount) as total from public.expenses
                 where household_id = v_h and spent_on >= v_start and spent_on < v_end
                 group by paid_by) s on s.paid_by = m.user_id
      where m.household_id = v_h and (m.left_at is null or s.total > 0)), '[]'::jsonb),
    'goal', (select jsonb_build_object(
               'name', g.name, 'target', g.target_amount,
               'saved', coalesce((select sum(c.amount) from public.contributions c where c.goal_id = g.id), 0))
             from public.goals g
             where g.household_id = v_h and not g.archived
             order by g.created_at limit 1)
  );
end;
$$;

-- Un pago de deuda solo se registra a nombre propio (como hace la app)
drop policy debt_payments_insert on public.debt_payments;
create policy debt_payments_insert on public.debt_payments for insert to authenticated
  with check (public.is_member(household_id) and paid_by = (select auth.uid()));

-- =====================================================================
-- 3. Ingresos extra (bonos, ventas, honorarios). Privados como el sueldo.
-- =====================================================================
create table public.incomes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  amount       bigint not null check (amount > 0 and amount < 10000000000),
  source       text not null check (char_length(source) between 1 and 60),
  received_on  date not null default ((now() at time zone 'America/Santiago')::date),
  created_at   timestamptz not null default now(),
  foreign key (household_id, user_id) references public.members (household_id, user_id)
);
create index incomes_user_date_idx on public.incomes (user_id, received_on desc);

revoke all on public.incomes from anon, authenticated;
grant select, insert, delete on public.incomes to authenticated;
grant update (amount, source, received_on) on public.incomes to authenticated;

alter table public.incomes enable row level security;
create policy incomes_select on public.incomes for select to authenticated
  using (user_id = (select auth.uid()));
create policy incomes_insert on public.incomes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
create policy incomes_update on public.incomes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy incomes_delete on public.incomes for delete to authenticated
  using (user_id = (select auth.uid()));

-- =====================================================================
-- 4. Gastos fijos: se generan solos cada mes en su día
-- =====================================================================
create table public.recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id  uuid not null,
  amount       bigint not null check (amount > 0 and amount < 10000000000),
  note         text not null check (char_length(note) between 1 and 120),
  paid_by      uuid not null,
  shared       boolean not null default true,
  day_of_month int not null check (day_of_month between 1 and 31),
  starts_on    date not null default ((now() at time zone 'America/Santiago')::date),
  -- Primer día del último mes ya generado (o saltado)
  last_applied date,
  active       boolean not null default true,
  created_by   uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (id, household_id),
  foreign key (category_id, household_id) references public.categories (id, household_id),
  foreign key (household_id, paid_by)     references public.members (household_id, user_id),
  foreign key (household_id, created_by)  references public.members (household_id, user_id)
);
create index recurring_household_idx on public.recurring_expenses (household_id);

alter table public.expenses add column recurring_id uuid;
alter table public.expenses add foreign key (recurring_id) references public.recurring_expenses (id) on delete set null;

revoke all on public.recurring_expenses from anon, authenticated;
grant select, insert, delete on public.recurring_expenses to authenticated;
grant update (category_id, amount, note, paid_by, shared, day_of_month, active)
  on public.recurring_expenses to authenticated;

alter table public.recurring_expenses enable row level security;
create policy recurring_select on public.recurring_expenses for select to authenticated
  using (public.is_member(household_id));
create policy recurring_insert on public.recurring_expenses for insert to authenticated
  with check (public.is_member(household_id) and created_by = (select auth.uid()));
create policy recurring_update on public.recurring_expenses for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy recurring_delete on public.recurring_expenses for delete to authenticated
  using (public.is_member(household_id));

-- Crea los gastos que tocan hasta hoy (incluidos meses en que nadie abrió la app).
-- Bloquea cada regla, así dos teléfonos a la vez no duplican; si borras uno generado no reaparece.
create function public.apply_recurring()
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_h      uuid := public.my_household();
  v_today  date := (now() at time zone 'America/Santiago')::date;
  v_month  date := date_trunc('month', v_today)::date;
  r        record;
  m        date;
  target   date;
  n        int := 0;
begin
  if v_h is null then
    return 0;
  end if;
  for r in
    select * from public.recurring_expenses
     where household_id = v_h and active
       and (last_applied is null or last_applied < v_month)
     for update
  loop
    m := coalesce((r.last_applied + interval '1 month')::date, date_trunc('month', r.starts_on)::date);
    while m <= v_month loop
      target := least(m + (r.day_of_month - 1), (m + interval '1 month' - interval '1 day')::date);
      exit when target > v_today;
      if target >= r.starts_on then
        insert into public.expenses (household_id, category_id, amount, paid_by, shared, note, spent_on, created_by, recurring_id)
        values (v_h, r.category_id, r.amount, r.paid_by, r.shared, r.note, target, v_uid, r.id);
        n := n + 1;
      end if;
      update public.recurring_expenses set last_applied = m where id = r.id;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end;
$$;

-- =====================================================================
-- 5. Salir del hogar y borrar la cuenta
-- =====================================================================
create function public.leave_household()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_h   uuid := public.my_household();
begin
  if v_h is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  perform 1 from public.households where id = v_h for update;

  -- A solas: se borra el hogar completo
  if (select count(*) from public.members where household_id = v_h and left_at is null) = 1 then
    delete from public.households where id = v_h;
    return;
  end if;

  -- En pareja: lo privado y lo personal se va contigo; lo compartido queda en el historial
  delete from public.salaries where user_id = v_uid;
  delete from public.incomes where user_id = v_uid;
  delete from public.profiles where user_id = v_uid;
  delete from public.debts where household_id = v_h and owner_id = v_uid;
  delete from public.widget_tokens where household_id = v_h and created_by = v_uid;
  delete from public.recurring_expenses where household_id = v_h and paid_by = v_uid;
  update public.members set left_at = now() where household_id = v_h and user_id = v_uid;
end;
$$;

create function public.delete_account()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if public.my_household() is not null then
    perform public.leave_household();
  end if;
  delete from public.push_subscriptions where user_id = v_uid;
  -- Arrastra sesiones, identidades, sueldo, ingresos y perfil (on delete cascade)
  delete from auth.users where id = v_uid;
end;
$$;

-- =====================================================================
-- 6. Tiempo real por canal privado. postgres_changes no aplica RLS a los DELETE
-- (con replica identity full llegaban a todos los usuarios); ahora solo se avisa
-- qué tabla cambió, por un canal que únicamente pueden escuchar los miembros.
-- =====================================================================
create function public.notify_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row   record := case when tg_op = 'DELETE' then old else new end;
  v_topic text;
begin
  if tg_table_name in ('salaries', 'incomes') then
    v_topic := 'u:' || v_row.user_id::text;           -- privado: solo sus otros dispositivos
  elsif tg_table_name = 'households' then
    v_topic := 'hh:' || v_row.id::text;
  else
    v_topic := 'hh:' || v_row.household_id::text;
  end if;
  perform realtime.send(jsonb_build_object('table', tg_table_name), 'change', v_topic, true);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['households', 'members', 'categories', 'expenses', 'goals', 'contributions',
                           'debts', 'debt_payments', 'salaries', 'profiles', 'incomes', 'recurring_expenses']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.notify_change()', t || '_notify', t);
  end loop;

  for t in select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table public.%I', t);
  end loop;

  foreach t in array array['expenses', 'contributions', 'debts', 'debt_payments', 'salaries', 'profiles']
  loop
    execute format('alter table public.%I replica identity default', t);
  end loop;
end;
$$;

create function public.can_listen(p_topic text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_topic ~ '^u:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return substr(p_topic, 3)::uuid = (select auth.uid());
  end if;
  if p_topic ~ '^hh:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.is_member(substr(p_topic, 4)::uuid);
  end if;
  return false;
end;
$$;

create policy nido_listen on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_listen((select realtime.topic())));

-- =====================================================================
-- 7. Permisos de las funciones
-- =====================================================================
revoke all on function public.my_household(), public.members_limit(), public.new_invite_code(),
  public.apply_recurring(), public.leave_household(), public.delete_account(),
  public.notify_change(), public.can_listen(text)
  from public, anon, authenticated;
grant execute on function public.my_household(), public.apply_recurring(), public.leave_household(),
  public.delete_account(), public.can_listen(text) to authenticated;
