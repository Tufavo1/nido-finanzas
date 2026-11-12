-- Fecha de nacimiento: solo personas adultas, fechas posibles, y privada (la pareja no la ve ni la cambia).
-- Ejecutar: docker exec -i supabase_db_nido psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/fecha_nacimiento.sql
begin;

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.cl'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@test.cl');

create function public.como(u uuid) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u)::text, true) $$;
grant execute on function public.como(uuid) to authenticated;

create function public.filas(q text) returns int
language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.filas(text) to authenticated;

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

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  h uuid; code text;
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  set local role authenticated;

  perform public.como(a);
  h := public.create_household('Casa', 'Ana');
  select invite_code into code from public.households where id = h;
  perform public.como(b);
  perform public.join_household(code, 'Beto');

  -- ---------- Un perfil sin fecha sigue valiendo (perfiles anteriores a esta migración) ----------
  perform public.como(a);
  insert into public.profiles (user_id, household_id, profession) values (a, h, 'Enfermera');
  assert (select birth_date from public.profiles where user_id = a) is null, 'el perfil se crea sin fecha';

  -- ---------- Solo personas adultas y fechas posibles ----------
  assert public.filas(format($q$update public.profiles set birth_date = %L where user_id = %L$q$, date '1990-05-20', a)) = 1, 'A guarda su fecha';
  assert (select birth_date from public.profiles where user_id = a) = date '1990-05-20', 'la fecha quedó guardada';
  assert public.filas(format($q$update public.profiles set birth_date = %L where user_id = %L$q$, (hoy - interval '18 years')::date, a)) = 1, 'quien cumple 18 hoy sí puede';
  perform public.debe_fallar(format($q$update public.profiles set birth_date = %L where user_id = %L$q$, (hoy - interval '18 years' + interval '1 day')::date, a));  -- le falta un día para los 18
  perform public.debe_fallar(format($q$update public.profiles set birth_date = %L where user_id = %L$q$, hoy + 1, a));                                             -- futura
  perform public.debe_fallar(format($q$update public.profiles set birth_date = %L where user_id = %L$q$, date '1850-01-01', a));                                   -- imposible
  assert (select birth_date from public.profiles where user_id = a) = (hoy - interval '18 years')::date, 'los intentos inválidos no cambiaron nada';

  -- ---------- La regla también vale al crear el perfil ----------
  perform public.como(b);
  perform public.debe_fallar(format($q$insert into public.profiles (user_id, household_id, birth_date) values (%L, %L, %L)$q$, b, h, (hoy - interval '10 years')::date));
  insert into public.profiles (user_id, household_id, birth_date) values (b, h, date '1988-01-15');

  -- ---------- Es privada: la pareja no la ve ni la cambia ----------
  assert (select count(*) from public.profiles) = 1, 'B solo ve su propio perfil';
  assert (select count(*) from public.profiles where user_id = a) = 0, 'B no lee la fecha de A';
  assert public.filas(format($q$update public.profiles set birth_date = %L where user_id = %L$q$, date '1970-01-01', a)) = 0, 'B no cambia la fecha de A';
  perform public.como(a);
  assert (select birth_date from public.profiles where user_id = a) = (hoy - interval '18 years')::date, 'la fecha de A sigue intacta';
end $$;

rollback;
select 'fecha_nacimiento: OK' as resultado;
