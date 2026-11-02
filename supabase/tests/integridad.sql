-- Integridad de datos: fechas imposibles se rechazan en la base, no solo en la interfaz.
-- Ejecutar: docker exec -i supabase_db_nido psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/integridad.sql
begin;
insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.cl');
create function public.como(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u)::text, true) $$;
grant execute on function public.como(uuid) to authenticated;
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000a1'; h uuid; cat uuid; g uuid; d uuid; e uuid;
begin
  set local role authenticated;
  perform public.como(a);
  h := public.create_household('Casa', 'Ana');
  select id into cat from public.categories where name = 'Supermercado';
  insert into public.goals (household_id, name, target_amount) values (h, 'Meta', 1000) returning id into g;
  insert into public.debts (household_id, name, original_amount) values (h, 'Deuda', 1000) returning id into d;

  -- hoy y mañana (margen de zona horaria) valen; pasado mañana no
  insert into public.expenses (household_id, category_id, amount, paid_by, shared, note, spent_on) values (h, cat, 100, a, true, 'hoy', (now() at time zone 'America/Santiago')::date) returning id into e;
  begin insert into public.expenses (household_id, category_id, amount, paid_by, shared, note, spent_on) values (h, cat, 100, a, true, 'futuro', current_date + 3); assert false, 'gasto futuro';
  exception when check_violation then null; end;
  begin insert into public.expenses (household_id, category_id, amount, paid_by, shared, note, spent_on) values (h, cat, 100, a, true, 'antiguo', '1900-01-01'); assert false, 'gasto de 1900';
  exception when check_violation then null; end;
  begin update public.expenses set spent_on = '2099-01-01' where id = e; assert false, 'editar a fecha futura';
  exception when check_violation then null; end;
  update public.expenses set amount = 200 where id = e;   -- editar otra cosa no revalida la fecha

  begin insert into public.contributions (household_id, goal_id, user_id, amount, contributed_on) values (h, g, a, 10, '2099-01-01'); assert false, 'aporte futuro';
  exception when check_violation then null; end;
  begin insert into public.debt_payments (household_id, debt_id, amount, paid_by, paid_on) values (h, d, 10, a, '2099-01-01'); assert false, 'pago futuro';
  exception when check_violation then null; end;
  insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (h, d, 10, a);   -- sin fecha = hoy
  begin insert into public.incomes (household_id, user_id, amount, source, received_on) values (h, a, 10, 'x', '2099-01-01'); assert false, 'ingreso futuro';
  exception when check_violation then null; end;
end $$;
rollback;
select 'integridad: OK' as resultado;
