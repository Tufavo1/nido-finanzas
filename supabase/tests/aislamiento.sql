-- Aislamiento entre hogares y tablas privadas.
--
-- Normal:    psql -v ON_ERROR_STOP=1 < aislamiento.sql
--   Una persona de otro hogar (C) y una persona común (A) no pueden leer, cambiar ni borrar lo ajeno,
--   y cada rechazo debe venir del permiso o de RLS (SQLSTATE 42501), no de un error cualquiera.
-- Mutación:  psql -v ON_ERROR_STOP=1 -v mutar=1 < aislamiento.sql
--   Apaga RLS (o da permisos) tabla por tabla, solo dentro de la transacción, y exige que las mismas
--   pruebas FALLEN: así queda demostrado que detectan una política rota. Todo termina en ROLLBACK.
-- Solo para la base local, con usuarios sintéticos.
begin;

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.cl'),
       ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c@test.cl');

create table public.t_casos (
  id serial primary key,
  grupo text not null,
  quien uuid not null,
  modo text not null,      -- 'falla': debe lanzar el error 'esperado' · 'cero': debe afectar o devolver 0
  esperado text,
  q text not null
);
create table public.t_mut (grupo text primary key, sql text not null);

-- Ejecuta los casos de un grupo con el rol authenticated; devuelve '' si todos se cumplen, o el primer incumplimiento
create function public.t_correr(p_grupo text) returns text
language plpgsql as $$
declare r record; n bigint;
begin
  for r in select * from public.t_casos where grupo = p_grupo order by id loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.quien)::text, true);
    set local role authenticated;
    begin
      if r.modo = 'falla' then
        execute r.q;
        reset role;
        return 'DEBIA FALLAR: ' || r.q;
      end if;
      execute r.q into n;
      if n <> 0 then
        reset role;
        return 'DEBIA SER 0 (fue ' || n || '): ' || r.q;
      end if;
    exception when others then
      reset role;
      if r.modo = 'falla' and sqlstate = r.esperado then
        continue;
      elsif r.modo = 'cero' and sqlstate = '42501' then
        continue;  -- sin permiso: tampoco ve ni cambia nada
      end if;
      return format('ERROR %s (%s) en: %s', sqlstate, sqlerrm, r.q);
    end;
    reset role;
  end loop;
  return '';
end $$;

do $$
declare
  a  uuid := '00000000-0000-0000-0000-0000000000a1';
  c  uuid := '00000000-0000-0000-0000-0000000000c3';
  h1 uuid; h3 uuid; cat1 uuid; g1 uuid; d1 uuid;
  tok_a text; tok_c text;
  t text; filt text; col text;
begin
  set local role authenticated;

  -- A arma su hogar con un dato de cada tipo
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  h1 := public.create_household('Casa de A', 'Ana');
  select id into cat1 from public.categories where household_id = h1 limit 1;
  insert into public.expenses (household_id, category_id, amount, paid_by) values (h1, cat1, 48900, a);
  insert into public.goals (household_id, name, target_amount) values (h1, 'Viaje', 500000) returning id into g1;
  insert into public.contributions (household_id, goal_id, user_id, amount) values (h1, g1, a, 10000);
  insert into public.debts (household_id, name, original_amount) values (h1, 'Auto', 900000) returning id into d1;
  insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (h1, d1, 50000, a);
  insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, day_of_month)
    values (h1, cat1, 20000, 'Arriendo', a, 5);
  insert into public.incomes (household_id, amount, source) values (h1, 100000, 'Extra');
  insert into public.profiles (user_id, household_id) values (a, h1);
  insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('https://push.test/a', 'k', 'k');
  tok_a := public.create_widget_token('Widget de A');

  -- C tiene su propio hogar, vacío
  perform set_config('request.jwt.claims', json_build_object('sub', c)::text, true);
  h3 := public.create_household('Casa de C', 'Carla');
  tok_c := public.create_widget_token('Widget de C');
  reset role;

  -- C frente al hogar de A: no lee, no cambia, no borra (un grupo por tabla)
  foreach t in array array['expenses','categories','goals','contributions','debts','debt_payments',
                           'recurring_expenses','incomes','profiles','members','widget_tokens','households'] loop
    filt := case when t = 'households' then format('id = %L', h1) else format('household_id = %L', h1) end;
    col  := case when t = 'households' then 'id' else 'household_id' end;
    insert into public.t_casos (grupo, quien, modo, q) values
      (t, c, 'cero', format('select count(*) from public.%I where %s', t, filt)),
      (t, c, 'cero', format('with x as (update public.%I set %s = %s where %s returning 1) select count(*) from x', t, col, col, filt)),
      (t, c, 'cero', format('with x as (delete from public.%I where %s returning 1) select count(*) from x', t, filt));
    insert into public.t_mut values (t, format('alter table public.%I disable row level security', t));
  end loop;

  -- C no puede escribir a nombre del hogar de A
  insert into public.t_casos (grupo, quien, modo, esperado, q) values
    ('expenses', c, 'falla', '42501', format('insert into public.expenses (household_id, category_id, amount, paid_by) values (%L,%L,1000,%L)', h1, cat1, a)),
    ('categories', c, 'falla', '42501', format('insert into public.categories (household_id, name) values (%L,%L)', h1, 'Hack')),
    ('goals', c, 'falla', '42501', format('insert into public.goals (household_id, name, target_amount) values (%L,%L,1000)', h1, 'Hack')),
    ('contributions', c, 'falla', '42501', format('insert into public.contributions (household_id, goal_id, user_id, amount) values (%L,%L,%L,1000)', h1, g1, a)),
    ('debts', c, 'falla', '42501', format('insert into public.debts (household_id, name, original_amount) values (%L,%L,1000)', h1, 'Hack')),
    ('debt_payments', c, 'falla', '42501', format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,1000,%L)', h1, d1, a)),
    ('recurring_expenses', c, 'falla', '42501', format('insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, day_of_month) values (%L,%L,1000,%L,%L,5)', h1, cat1, 'Hack', a)),
    ('incomes', c, 'falla', '42501', format('insert into public.incomes (household_id, amount, source) values (%L,1000,%L)', h1, 'Hack'));

  -- Avisos al celular: de cada persona
  insert into public.t_casos (grupo, quien, modo, q) values
    ('push_subscriptions', c, 'cero', 'select count(*) from public.push_subscriptions'),
    ('push_subscriptions', c, 'cero', format('with x as (update public.push_subscriptions set endpoint = endpoint where user_id = %L returning 1) select count(*) from x', a)),
    ('push_subscriptions', c, 'cero', format('with x as (delete from public.push_subscriptions where user_id = %L returning 1) select count(*) from x', a));
  insert into public.t_mut values ('push_subscriptions', 'alter table public.push_subscriptions disable row level security');

  -- Tablas internas: ninguna persona autenticada las toca directamente
  insert into public.t_casos (grupo, quien, modo, esperado, q) values
    ('admins', a, 'falla', '42501', 'select count(*) from public.admins'),
    ('admins', a, 'falla', '42501', format('insert into public.admins (user_id) values (%L)', a)),
    ('admin_audit', a, 'falla', '42501', 'select count(*) from public.admin_audit'),
    ('admin_audit', a, 'falla', '42501', format('insert into public.admin_audit (admin_id, action) values (%L, %L)', a, 'hack')),
    ('invite_attempts', a, 'falla', '42501', 'select count(*) from public.invite_attempts'),
    ('invite_attempts', a, 'falla', '42501', format('insert into public.invite_attempts (user_id) values (%L)', a));
  insert into public.t_mut values
    ('admins', 'grant all on public.admins to authenticated; alter table public.admins disable row level security'),
    ('admin_audit', 'grant all on public.admin_audit to authenticated; alter table public.admin_audit disable row level security'),
    ('invite_attempts', 'grant all on public.invite_attempts to authenticated; alter table public.invite_attempts disable row level security');

  -- Widget: un token inválido no entrega nada y cada token solo ve su hogar
  insert into public.t_casos (grupo, quien, modo, esperado, q) values
    ('widget_summary', c, 'falla', '28000', 'select public.widget_summary(''nw_inventado'')'),
    ('widget_summary', c, 'falla', '28000', 'select public.widget_summary('''')'),
    ('widget_summary', c, 'falla', '28000', 'select public.widget_summary(null)'),
    ('widget_summary', c, 'falla', '28000', format('select public.widget_summary(%L)', tok_a || 'x'));
  insert into public.t_casos (grupo, quien, modo, q) values
    ('widget_summary', c, 'cero', format('select (public.widget_summary(%L) ->> ''spent'')::bigint', tok_c));
  -- control positivo: el token de A sí ve su gasto (si no, la prueba anterior no probaría nada)
  assert (public.widget_summary(tok_a) ->> 'spent')::bigint = 48900, 'el token de A debe ver el gasto de A';
end $$;

\if :{?mutar}
-- ---------------------------------------------------------------- mutación
do $$
declare r record; res text; fallo int := 0;
begin
  for r in select * from public.t_mut order by grupo loop
    assert public.t_correr(r.grupo) = '', 'sin mutación, el grupo ' || r.grupo || ' debe pasar';
    execute r.sql;
    res := public.t_correr(r.grupo);
    if res = '' then
      raise warning 'NO DETECTADO: el grupo % sigue pasando con "%"', r.grupo, r.sql;
      fallo := fallo + 1;
    else
      raise notice 'detectado en %: %', r.grupo, left(res, 110);
    end if;
  end loop;
  assert fallo = 0, fallo || ' mutaciones no fueron detectadas';
  raise notice 'TODAS LAS MUTACIONES FUERON DETECTADAS';
end $$;
\else
-- ---------------------------------------------------------------- normal
do $$
declare g text; res text; fallos text := '';
begin
  for g in select distinct grupo from public.t_casos order by 1 loop
    res := public.t_correr(g);
    if res <> '' then
      fallos := fallos || E'\n  [' || g || '] ' || res;
    end if;
  end loop;
  if fallos <> '' then
    raise exception 'AISLAMIENTO ROTO:%', fallos;
  end if;
  raise notice 'TODAS LAS PRUEBAS DE AISLAMIENTO PASARON';
end $$;
\endif

rollback;
