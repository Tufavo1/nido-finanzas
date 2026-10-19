-- Hogares de 1 o 2 personas: salir, borrar cuenta, ingresos, gastos fijos, invitaciones y canales.
-- Ejecutar: docker exec -i supabase_db_nido psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/hogares.sql
begin;

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.cl'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@test.cl'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c@test.cl'),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'd@test.cl');

create function public.debe_fallar(q text) returns void
language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    return;
  end;
  raise exception 'DEBIA FALLAR: %', q;
end $$;
grant execute on function public.debe_fallar(text) to authenticated;

create function public.como(u uuid) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u)::text, true) $$;
grant execute on function public.como(uuid) to authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  c uuid := '00000000-0000-0000-0000-0000000000c3';
  d uuid := '00000000-0000-0000-0000-0000000000d4';
  h1 uuid; h2 uuid; h3 uuid; code text; cat uuid; rid uuid; n int; today date;
begin
  set local role authenticated;
  today := (now() at time zone 'America/Santiago')::date;

  -- ---------- Invitaciones ----------
  perform public.como(a);
  h1 := public.create_household('Casa', 'Ana');
  select invite_code into code from public.households;
  assert code ~ '^[A-HJ-NP-Z2-9]{12}$', 'código de 12 caracteres sin 0/O/1/I';
  assert (select invite_expires_at > now() + interval '6 days' from public.households), 'la invitación vence en 7 días';
  select id into cat from public.categories where name = 'Supermercado';

  perform public.como(b);
  assert public.join_household(lower(code), 'Beto') = h1, 'B entra con el código';
  perform public.como(d);
  assert public.join_household(code, 'Dani') is null, 'el código usado ya no sirve';
  for i in 1..9 loop
    perform public.join_household('XXXXXXXXXXXX', 'Dani');
  end loop;
  perform public.debe_fallar($q$select public.join_household('XXXXXXXXXXXX', 'Dani')$q$);

  -- Tope duro de 2, aun saltándose las funciones
  reset role;
  perform public.debe_fallar(format($q$insert into public.members (household_id, user_id, display_name) values (%L, %L, 'x')$q$, h1, d));
  -- Una invitación vencida no sirve
  update public.households set invite_code = 'VENCIDOAAAAA', invite_expires_at = now() - interval '1 minute' where id = h1;
  set local role authenticated;
  perform public.como(c);
  assert public.join_household('VENCIDOAAAAA', 'Carla') is null, 'invitación vencida rechazada';
  reset role;
  update public.households set invite_code = null, invite_expires_at = null where id = h1;
  set local role authenticated;

  -- ---------- Ingresos: privados ----------
  perform public.como(a);
  insert into public.incomes (household_id, amount, source) values (h1, 200000, 'Bono');
  perform public.debe_fallar(format($q$insert into public.incomes (household_id, user_id, amount, source) values (%L, %L, 1, 'x')$q$, h1, b));
  perform public.como(b);
  select count(*) into n from public.incomes;
  assert n = 0, 'B no ve los ingresos de A';
  update public.incomes set amount = 1;
  get diagnostics n = row_count;
  assert n = 0, 'B no edita ingresos de A';

  -- ---------- Gastos fijos ----------
  perform public.como(a);
  -- Desde hace 2 meses, el día 1: debe generar 3 gastos (los 2 meses previos + este)
  insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, day_of_month, starts_on)
  values (h1, cat, 450000, 'Arriendo', a, 1, (date_trunc('month', today) - interval '2 months')::date)
  returning id into rid;
  assert public.apply_recurring() = 3, 'genera los meses pendientes';
  assert public.apply_recurring() = 0, 'no duplica al volver a correr';
  perform public.como(b);
  assert public.apply_recurring() = 0, 'la pareja tampoco duplica';
  select count(*) into n from public.expenses where recurring_id = rid;
  assert n = 3, 'quedan 3 gastos fijos';
  delete from public.expenses where recurring_id = rid and spent_on = date_trunc('month', today)::date;
  assert public.apply_recurring() = 0, 'un gasto fijo borrado no reaparece';
  -- Uno creado hoy con un día ya pasado no se cobra este mes
  perform public.como(a);
  insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, day_of_month)
  values (h1, cat, 1000, 'Pasado', a, greatest(extract(day from today)::int - 1, 1));
  if extract(day from today) > 1 then
    assert public.apply_recurring() = 0, 'regla nueva con día pasado parte el próximo mes';
  end if;

  -- ---------- Otro hogar: aislamiento ----------
  perform public.como(c);
  h3 := public.create_household('Ajena', 'Carla');
  select count(*) into n from public.recurring_expenses;
  assert n = 0, 'C no ve gastos fijos ajenos';
  perform public.debe_fallar(format($q$insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, day_of_month) values (%L, %L, 1, 'x', %L, 1)$q$, h1, cat, c));
  assert public.apply_recurring() = 0, 'C no genera nada en el hogar de A';
  assert not public.can_listen('hh:' || h1), 'C no escucha el canal de A';
  assert public.can_listen('hh:' || h3), 'C escucha su canal';
  assert public.can_listen('u:' || c), 'C escucha su canal privado';
  assert not public.can_listen('u:' || a), 'C no escucha el canal privado de A';
  assert not public.can_listen('hh:nada'), 'tema malformado';

  -- ---------- B sale del hogar compartido ----------
  perform public.como(b);
  insert into public.salaries (user_id, household_id, amount) values (b, h1, 800000);
  insert into public.incomes (household_id, amount, source) values (h1, 5000, 'Venta');
  insert into public.debts (household_id, name, original_amount, owner_id) values (h1, 'Tarjeta de Beto', 100000, b);
  insert into public.debts (household_id, name, original_amount) values (h1, 'Crédito común', 900000);
  insert into public.expenses (household_id, category_id, amount, paid_by) values (h1, cat, 7777, b);
  assert public.create_widget_token('Mi widget') like 'nw_%', 'B crea un widget';
  insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, day_of_month)
  values (h1, cat, 9990, 'Netflix', b, 28);
  perform public.leave_household();
  assert public.my_household() is null, 'B ya no tiene hogar';
  select count(*) into n from public.expenses;
  assert n = 0, 'B ya no ve los gastos del hogar';
  assert not public.can_listen('hh:' || h1), 'B ya no escucha el canal';

  perform public.como(a);
  select count(*) into n from public.members where household_id = h1 and left_at is null;
  assert n = 1, 'queda 1 persona activa';
  select count(*) into n from public.expenses where paid_by = b;
  assert n = 1, 'el gasto de B queda en el historial';
  select count(*) into n from public.debts;
  assert n = 1, 'la deuda personal de B se fue; la común queda';
  select count(*) into n from public.widget_tokens;
  assert n = 0, 'el widget de B quedó revocado';
  select count(*) into n from public.recurring_expenses where paid_by = b;
  assert n = 0, 'los gastos fijos de B se fueron';
  reset role;
  select count(*) into n from public.salaries where user_id = b;
  assert n = 0, 'el sueldo de B se borró';
  select count(*) into n from public.incomes where user_id = b;
  assert n = 0, 'los ingresos de B se borraron';
  set local role authenticated;

  -- B puede volver al mismo hogar: se reactiva su fila y su historial
  perform public.como(a);
  code := public.rotate_invite_code();
  perform public.como(b);
  assert public.join_household(code, 'Beto otra vez') = h1, 'B vuelve a entrar';
  select count(*) into n from public.expenses where paid_by = b;
  assert n = 1, 'B recupera la vista de su historial';
  select count(*) into n from public.members where household_id = h1 and left_at is null;
  assert n = 2, 'vuelven a ser 2';
  perform public.leave_household();

  -- B arma su propio hogar
  perform public.como(b);
  h2 := public.create_household('Depto de Beto', 'Beto');
  assert h2 is not null and h2 <> h1, 'B crea otro hogar';
  select count(*) into n from public.expenses;
  assert n = 0, 'el hogar nuevo de B parte vacío';

  -- ---------- B borra su cuenta ----------
  perform public.como(b);
  perform public.delete_account();
  reset role;
  select count(*) into n from auth.users where id = b;
  assert n = 0, 'la cuenta de B ya no existe';
  select count(*) into n from public.households where id = h2;
  assert n = 0, 'el hogar a solas de B se borró completo';
  select count(*) into n from public.members where household_id = h1 and user_id = b;
  assert n = 1, 'en el hogar de A queda el nombre de B en el historial';
  select count(*) into n from public.households where id = h1;
  assert n = 1, 'el hogar de A sigue intacto';
  select count(*) into n from public.households where id = h3;
  assert n = 1, 'el hogar de C sigue intacto';

  raise notice 'TODAS LAS PRUEBAS DE HOGARES PASARON';
end $$;

rollback;
