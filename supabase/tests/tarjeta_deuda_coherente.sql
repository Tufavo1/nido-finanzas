-- Copyright (c) 2026 Dinovance
-- B5: una deuda tipo tarjeta con gastos cargados (expenses.card_debt_id) no puede cambiar a otro tipo ni pasar a un
-- titular que no pagó esos gastos (trigger debts_tarjeta_con_gastos, migración 20261123130000).
-- Ejecutar SOLO en un Postgres desechable o en la base local (nunca producción). Todo termina en ROLLBACK.
-- Cualquier FALLA aborta con excepción; si todo pasa imprime «OK: ...» y «RESUMEN tarjeta_deuda_coherente pasa=N».
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at)
values ('00000000-0000-0000-0000-0000000b5a01', 'authenticated', 'authenticated', 'b5-a@example.invalid', now()),
       ('00000000-0000-0000-0000-0000000b5b02', 'authenticated', 'authenticated', 'b5-b@example.invalid', now());

create function public.t_b5(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
grant execute on function public.t_b5(text) to authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000b5a01';
  b uuid := '00000000-0000-0000-0000-0000000b5b02';
  h uuid; cat uuid; dshared uuid; dA uuid; dlibre uuid; dsolo uuid; ea uuid; s text; n int := 0;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('B5 Casa', 'Ana');
  reset role;
  insert into public.members (household_id, user_id, display_name) values (h, b, 'Beto');
  select id into cat from public.categories where household_id = h limit 1;
  insert into public.debts (household_id, name, kind, original_amount) values (h, 'CMR de los dos', 'tarjeta', 500000) returning id into dshared;
  insert into public.debts (household_id, name, kind, original_amount, owner_id) values (h, 'Tarjeta de A', 'tarjeta', 300000, a) returning id into dA;
  insert into public.debts (household_id, name, kind, original_amount) values (h, 'Tarjeta sin gastos', 'tarjeta', 100000) returning id into dlibre;
  insert into public.debts (household_id, name, kind, original_amount) values (h, 'Tarjeta solo de A', 'tarjeta', 100000) returning id into dsolo;
  -- Gastos con tarjeta pagados por A (la de los dos, la personal de A y otra de los dos que solo usa A)
  insert into public.expenses (household_id, category_id, amount, paid_by, created_by, note, payment_method, card_debt_id)
    values (h, cat, 1000, a, a, 'b5 compartida', 'tarjeta', dshared) returning id into ea;
  insert into public.expenses (household_id, category_id, amount, paid_by, created_by, note, payment_method, card_debt_id)
    values (h, cat, 2000, a, a, 'b5 personal', 'tarjeta', dA),
           (h, cat, 3000, a, a, 'b5 solo A', 'tarjeta', dsolo);

  set local role authenticated;
  -- 1. La pareja (B) se adueña de la tarjeta de los dos: la RLS se lo permite (owner_id = ella), el trigger no.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  s := public.t_b5(format('update public.debts set owner_id = %L where id = %L', b, dshared));
  if s not like '23514 %tarjeta tiene gastos%' then raise exception 'FALLA 1: B se adueño de una tarjeta con gastos de A (%)', s; end if;
  n := n + 1; raise notice 'OK 1: no se puede pasar a otra persona una tarjeta con gastos que no pagó';

  -- 2. Cambiar el tipo de una tarjeta con gastos: rechazado (de los dos y personal)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  s := public.t_b5(format('update public.debts set kind = %L where id = %L', 'credito', dshared));
  if s not like '23514 %' then raise exception 'FALLA 2a: cambió el tipo de una tarjeta con gastos (%)', s; end if;
  s := public.t_b5(format('update public.debts set kind = %L where id = %L', 'otro', dA));
  if s not like '23514 %' then raise exception 'FALLA 2b: cambió el tipo de su tarjeta con gastos (%)', s; end if;
  n := n + 1; raise notice 'OK 2: no se puede cambiar el tipo de una tarjeta con gastos';

  -- 3. Lo que sigue permitido con gastos cargados
  s := public.t_b5(format('update public.debts set name = %L, archived = true, original_amount = 350000 where id = %L', 'CMR nueva', dshared));
  if s <> 'OK' then raise exception 'FALLA 3a: no deja renombrar/archivar (%)', s; end if;
  s := public.t_b5(format('update public.debts set reported_balance = 1000, reported_at = %L where id = %L', (now() at time zone 'America/Santiago')::date, dshared));
  if s <> 'OK' then raise exception 'FALLA 3b: no deja informar el saldo (%)', s; end if;
  s := public.t_b5(format('update public.debts set kind = %L where id = %L', 'tarjeta', dshared));
  if s <> 'OK' then raise exception 'FALLA 3c: no deja reescribir el mismo tipo (%)', s; end if;
  s := public.t_b5(format('update public.debts set owner_id = null where id = %L', dA));
  if s <> 'OK' then raise exception 'FALLA 3d: no deja pasar su tarjeta a «de los dos» (%)', s; end if;
  s := public.t_b5(format('update public.debts set owner_id = %L where id = %L', a, dsolo));
  if s <> 'OK' then raise exception 'FALLA 3e: no deja asignarla a quien pagó todos sus gastos (%)', s; end if;
  s := public.t_b5(format('update public.debts set kind = %L, owner_id = %L where id = %L', 'credito', a, dlibre));
  if s <> 'OK' then raise exception 'FALLA 3f: una tarjeta SIN gastos debe poder cambiar (%)', s; end if;
  n := n + 1; raise notice 'OK 3: renombrar, archivar, saldo informado, pasar a de los dos y tarjetas sin gastos siguen permitidos';

  -- 4. Movido el gasto, el cambio de tipo pasa
  update public.expenses set card_debt_id = null, payment_method = 'debito' where id = ea;
  s := public.t_b5(format('update public.debts set kind = %L where id = %L', 'credito', dshared));
  if s <> 'OK' then raise exception 'FALLA 4: sin gastos debería dejar cambiar el tipo (%)', s; end if;
  n := n + 1; raise notice 'OK 4: tras mover los gastos, la deuda se puede cambiar';
  reset role;

  -- 5. Tampoco un rol de servicio la deja incoherente (dsolo es de A con gasto de A: pasarla a B falla)
  s := public.t_b5(format('update public.debts set owner_id = %L where id = %L', b, dsolo));
  if s not like '23514 %' then raise exception 'FALLA 5a: el rol de servicio dejó una tarjeta incoherente (%)', s; end if;
  n := n + 1; raise notice 'OK 5: la regla vale también fuera de la app';

  -- 6. La función no es invocable por los roles de la app
  if has_function_privilege('authenticated', 'public.check_deuda_tarjeta_con_gastos()', 'execute')
     or has_function_privilege('anon', 'public.check_deuda_tarjeta_con_gastos()', 'execute') then
    raise exception 'FALLA 6: la función del trigger es ejecutable por anon/authenticated';
  end if;
  if not exists (select 1 from pg_proc where proname = 'check_deuda_tarjeta_con_gastos' and prosecdef
                   and proconfig @> array['search_path=""']) then
    raise exception 'FALLA 6b: la función debe ser security definer con search_path vacío';
  end if;
  n := n + 1; raise notice 'OK 6: función del trigger sin execute para anon/authenticated y con search_path vacío';

  raise notice 'RESUMEN tarjeta_deuda_coherente pasa=% falla=0', n;
end $$;
rollback;
