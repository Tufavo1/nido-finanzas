-- ---------------------------------------------------------------------------------------------
-- Endurece el panel de administración:
--   · la lista de administradores vive en una tabla (admins), ya no en un correo repetido en cada función;
--   · todas las funciones admin_* exigen sesión con segundo factor (aal2);
--   · admin_status() le dice al front si hay que pedir el código TOTP;
--   · admin_households ya no devuelve nombres ni ids de cuenta (solo una referencia opaca por persona);
--   · borrar hogares tiene tope por llamada y deja registro en admin_audit.
-- ---------------------------------------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on table public.admins from public, anon, authenticated;

insert into public.admins (user_id)
select u.id from auth.users u
where lower(u.email) = 'joseromeroesteban353@gmail.com' and u.email_confirmed_at is not null
on conflict do nothing;

-- Registro de acciones destructivas del panel. Sin políticas: solo lo escriben las funciones admin_*.
create table public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb
);
alter table public.admin_audit enable row level security;
revoke all on table public.admin_audit from public, anon, authenticated;

-- 'none' (no es admin) | 'needs_mfa' (es admin, falta verificar el segundo factor) | 'ok'
create function public.admin_status()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not exists (
    select 1 from public.admins a join auth.users u on u.id = a.user_id
    where a.user_id = v_me and u.email_confirmed_at is not null
  ) then
    return 'none';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    return 'needs_mfa';
  end if;
  return 'ok';
end;
$$;

-- Uso interno de las funciones admin_*: no se expone a la API
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.admin_status() = 'ok' $$;

revoke all on function public.admin_status() from public, anon;
grant execute on function public.admin_status() to authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;

-- Resto de funciones del panel: misma lógica, ahora autorizadas por is_admin() (tabla admins + aal2)
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'db_bytes', pg_database_size(current_database()),
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
      'new_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      'new_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      'active_1d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '1 day'),
      'active_7d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
      'active_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days')
    ),
    'households', jsonb_build_object(
      'total', (select count(*) from public.households),
      'couples', (select count(*) from (select household_id from public.members group by household_id having count(*) >= 2) t),
      'solo', (select count(*) from (select household_id from public.members group by household_id having count(*) = 1) t)
    ),
    'usage', jsonb_build_object(
      'expenses_total', (select count(*) from public.expenses),
      'expenses_7d', (select count(*) from public.expenses where created_at >= now() - interval '7 days'),
      'expenses_30d', (select count(*) from public.expenses where created_at >= now() - interval '30 days'),
      'users_with_expense_7d', (select count(distinct created_by) from public.expenses where created_at >= now() - interval '7 days')
    ),
    -- Cuántos hogares/personas usan cada función (qué se usa más)
    'features', jsonb_build_array(
      jsonb_build_object('name', 'Gastos', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.expenses)),
      jsonb_build_object('name', 'Metas', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.goals)),
      jsonb_build_object('name', 'Aportes a metas', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.contributions)),
      jsonb_build_object('name', 'Gastos fijos', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.recurring_expenses)),
      jsonb_build_object('name', 'Deudas', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.debts)),
      jsonb_build_object('name', 'Pagos de deudas', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.debt_payments)),
      jsonb_build_object('name', 'Plata extra', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.incomes)),
      jsonb_build_object('name', 'Sueldo guardado', 'unit', 'personas', 'count', (select count(*) from public.salaries)),
      jsonb_build_object('name', 'Avisos al celular', 'unit', 'personas', 'count', (select count(distinct user_id) from public.push_subscriptions)),
      jsonb_build_object('name', 'Widgets', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.widget_tokens))
    ),
    -- Últimos 14 días, un número por día (incluye días en cero)
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d::date,
        'signups', (select count(*) from auth.users u where (u.created_at at time zone 'America/Santiago')::date = d::date),
        'expenses', (select count(*) from public.expenses e where (e.created_at at time zone 'America/Santiago')::date = d::date)
      ) order by d), '[]'::jsonb)
      from generate_series(
        ((now() at time zone 'America/Santiago')::date - 13)::timestamp,
        (now() at time zone 'America/Santiago')::date::timestamp,
        interval '1 day'
      ) d
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_storage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_db bigint := pg_database_size(current_database());
  v_tables jsonb;
  v_public bigint;
  v_per_day numeric := 0;
  v_t text;
  v_rows bigint;
  v_new bigint;
  v_bytes bigint;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'bytes', t.bytes) order by t.bytes desc), '[]'::jsonb),
         coalesce(sum(t.bytes), 0)
    into v_tables, v_public
  from (
    select c.relname::text as name, pg_total_relation_size(c.oid) as bytes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ) t;

  -- Crecimiento: filas nuevas de los últimos 30 días x tamaño medio de una fila de cada tabla
  foreach v_t in array array['expenses', 'contributions', 'debt_payments', 'incomes']
  loop
    execute format('select count(*), count(*) filter (where created_at > now() - interval ''30 days'') from public.%I', v_t)
      into v_rows, v_new;
    execute format('select pg_total_relation_size(%L::regclass)', 'public.' || v_t) into v_bytes;
    if v_rows > 0 then
      v_per_day := v_per_day + (v_new::numeric / 30) * (v_bytes::numeric / v_rows);
    end if;
  end loop;

  return jsonb_build_object(
    'db_bytes', v_db,
    'public_bytes', v_public,
    'tables', v_tables,
    'bytes_per_day', round(v_per_day)
  );
end;
$$;


-- Hogares: sin nombres ni ids de cuenta. Cada persona se identifica con una referencia opaca válida solo dentro de su hogar.
drop function if exists public.admin_households();

create function public.admin_households()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_mine uuid;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select household_id into v_mine from public.members where user_id = v_me and left_at is null;

  select coalesce(jsonb_agg(t order by t.last_activity), '[]'::jsonb) into v_result
  from (
    select
      h.id,
      left(h.id::text, 8) as code,
      h.created_at,
      m.active_members,
      greatest(h.created_at, coalesce(a.last_at, h.created_at)) as last_activity,
      coalesce(a.expenses, 0) as expenses,
      true as deletable,
      m.members
    from public.households h
    cross join lateral (
      select
        count(*) filter (where left_at is null) as active_members,
        coalesce(jsonb_agg(jsonb_build_object(
          'ref', left(encode(sha256(convert_to(mm.user_id::text || ':' || mm.household_id::text, 'UTF8')), 'hex'), 20),
          'joined_at', mm.joined_at
        ) order by mm.joined_at) filter (where mm.left_at is null), '[]'::jsonb) as members
      from public.members mm where mm.household_id = h.id
    ) m
    cross join lateral (
      select count(*) as expenses, max(created_at) as last_at from public.expenses where household_id = h.id
    ) a
    where h.id is distinct from v_mine
    order by greatest(h.created_at, coalesce(a.last_at, h.created_at))
    limit 200
  ) t;
  return v_result;
end;
$$;

create or replace function public.admin_delete_households(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_mine uuid;
  v_deleted uuid[];
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('deleted', 0, 'skipped', 0);
  end if;
  if array_length(p_ids, 1) > 20 then
    raise exception 'Máximo 20 hogares por vez';
  end if;
  select household_id into v_mine from public.members where user_id = v_me and left_at is null;

  with gone as (
    delete from public.households
    where id = any (p_ids) and id is distinct from v_mine
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_deleted from gone;

  insert into public.admin_audit (admin_id, action, detail)
  values (v_me, 'delete_households', jsonb_build_object('requested', array_length(p_ids, 1), 'deleted_ids', to_jsonb(v_deleted)));

  return jsonb_build_object('deleted', cardinality(v_deleted), 'skipped', array_length(p_ids, 1) - cardinality(v_deleted));
end;
$$;

-- Saca a una persona de su hogar a partir de la referencia opaca de admin_households
drop function if exists public.admin_remove_member(uuid, uuid);

create function public.admin_remove_member(p_household uuid, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform 1 from public.households where id = p_household for update;
  select m.user_id into v_user
  from public.members m
  where m.household_id = p_household and m.left_at is null
    and left(encode(sha256(convert_to(m.user_id::text || ':' || m.household_id::text, 'UTF8')), 'hex'), 20) = p_ref;
  if v_user is null then
    return jsonb_build_object('removed', false, 'household_deleted', false);
  end if;
  if v_user = v_me then
    raise exception 'No puedes sacarte a ti mismo desde el panel';
  end if;

  insert into public.admin_audit (admin_id, action, detail)
  values (v_me, 'remove_member', jsonb_build_object('household_id', p_household));

  if (select count(*) from public.members where household_id = p_household and left_at is null) = 1 then
    delete from public.households where id = p_household;
    return jsonb_build_object('removed', true, 'household_deleted', true);
  end if;

  delete from public.salaries where user_id = v_user;
  delete from public.incomes where user_id = v_user;
  delete from public.profiles where user_id = v_user;
  delete from public.debts where household_id = p_household and owner_id = v_user;
  delete from public.widget_tokens where household_id = p_household and created_by = v_user;
  delete from public.recurring_expenses where household_id = p_household and paid_by = v_user;
  update public.members set left_at = now() where household_id = p_household and user_id = v_user;
  return jsonb_build_object('removed', true, 'household_deleted', false);
end;
$$;

revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_storage() from public, anon;
revoke all on function public.admin_households() from public, anon;
revoke all on function public.admin_delete_households(uuid[]) from public, anon;
revoke all on function public.admin_remove_member(uuid, text) from public, anon;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_storage() to authenticated;
grant execute on function public.admin_households() to authenticated;
grant execute on function public.admin_delete_households(uuid[]) to authenticated;
grant execute on function public.admin_remove_member(uuid, text) to authenticated;
