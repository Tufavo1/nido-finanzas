-- Privacidad con la pareja: lo que cada persona esconde no lo ve la otra, y lo compartido sí.
-- Ejecutar: docker exec -i supabase_db_nido psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/privacidad.sql
begin;

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.cl'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@test.cl');

create function public.como(u uuid) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u)::text, true) $$;
grant execute on function public.como(uuid) to authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  h1 uuid; code text; cat uuid; d_a uuid; d_both uuid; g uuid; n int;
begin
  set local role authenticated;

  perform public.como(a);
  h1 := public.create_household('Casa', 'Ana');
  select invite_code into code from public.households;
  select id into cat from public.categories where name = 'Supermercado';
  perform public.como(b);
  perform public.join_household(code, 'Beto');

  -- A anota un dato de cada tipo: personal, compartido, deudas, fijo, aporte
  perform public.como(a);
  insert into public.expenses (household_id, category_id, amount, paid_by, shared) values
    (h1, cat, 1000, a, false), (h1, cat, 2000, a, true);
  insert into public.debts (household_id, name, original_amount, owner_id) values (h1, 'Deuda de A', 500000, a) returning id into d_a;
  insert into public.debts (household_id, name, original_amount) values (h1, 'Deuda de los dos', 300000) returning id into d_both;
  insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (h1, d_a, 10000, a), (h1, d_both, 5000, a);
  insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, shared, day_of_month) values
    (h1, cat, 9000, 'Gym', a, false, 5), (h1, cat, 80000, 'Arriendo', a, true, 5);
  insert into public.goals (household_id, name, target_amount) values (h1, 'Viaje', 900000) returning id into g;
  insert into public.contributions (household_id, goal_id, user_id, amount) values (h1, g, a, 20000);

  -- Por defecto B ve todo
  perform public.como(b);
  assert (select count(*) from public.expenses) = 2, 'por defecto B ve los dos gastos';
  assert (select count(*) from public.debts) = 2, 'por defecto B ve las dos deudas';
  assert (select count(*) from public.recurring_expenses) = 2, 'por defecto B ve los dos fijos';
  assert (select count(*) from public.contributions) = 1, 'por defecto B ve el aporte';

  -- A esconde todo lo suyo
  perform public.como(a);
  update public.members set share_debts = false, share_fixed = false, share_personal = false, share_savings = false where user_id = a;
  assert (select count(*) from public.expenses) = 2, 'A sigue viendo lo suyo';

  perform public.como(b);
  assert (select count(*) from public.expenses where shared = false) = 0, 'B no ve el gasto personal de A';
  assert (select count(*) from public.expenses where shared) = 1, 'B sigue viendo el compartido';
  assert (select count(*) from public.debts) = 1, 'B solo ve la deuda de los dos';
  assert (select count(*) from public.debts where id = d_a) = 0, 'B no ve la deuda de A';
  assert (select count(*) from public.debt_payments) = 1, 'B no ve los pagos de la deuda de A';
  assert (select count(*) from public.recurring_expenses) = 1, 'B solo ve el fijo compartido';
  assert (select count(*) from public.contributions) = 0, 'B no ve el aporte de A';

  -- B anota un gasto personal suyo y puede leerlo de vuelta (insert ... returning)
  insert into public.expenses (household_id, category_id, amount, paid_by, shared) values (h1, cat, 700, b, false);
  assert (select count(*) from public.expenses where amount = 700) = 1, 'B ve lo que él mismo anotó';
  -- ... pero ya no puede anotar uno personal a nombre de A (seguridad.sql lo cubre a fondo)
  begin
    insert into public.expenses (household_id, category_id, amount, paid_by, shared) values (h1, cat, 701, a, false);
    assert false, 'B no anota gastos personales a nombre de A';
  exception when insufficient_privilege then null; end;

  -- Solo se cambia lo propio
  perform public.como(b);
  update public.members set share_debts = false where user_id = a;
  perform public.como(a);
  assert (select share_debts from public.members where user_id = a) = false, 'B no pudo cambiar la privacidad de A (sigue como A la dejó)';

  -- A vuelve a compartir
  update public.members set share_debts = true, share_fixed = true, share_personal = true, share_savings = true where user_id = a;
  perform public.como(b);
  assert (select count(*) from public.debts) = 2 and (select count(*) from public.contributions) = 1, 'al compartir otra vez, B lo ve de nuevo';

  raise notice 'TODAS LAS PRUEBAS DE PRIVACIDAD PASARON';
end $$;

rollback;
