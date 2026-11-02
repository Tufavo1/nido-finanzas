-- DinovanceAI: cada persona lee solo lo que le toca de ai_insights, y desde la app nadie puede escribir.
-- Ejecutar: docker exec -i supabase_db_nido psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/ai_insights.sql
begin;

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.cl'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@test.cl'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c@test.cl');

create function public.como(u uuid) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u)::text, true) $$;
grant execute on function public.como(uuid) to authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  c uuid := '00000000-0000-0000-0000-0000000000c3';
  h1 uuid; h2 uuid; code text;
begin
  set local role authenticated;

  -- Hogar 1: Ana (a) y Beto (b). Hogar 2: Carla (c), ajena.
  perform public.como(a);
  h1 := public.create_household('Casa', 'Ana');
  select invite_code into code from public.households;
  perform public.como(b);
  perform public.join_household(code, 'Beto');
  perform public.como(c);
  h2 := public.create_household('Otra casa', 'Carla');

  -- El script de DinovanceAI (service_role / postgres) escribe los análisis
  reset role;
  insert into public.ai_insights (household_id, user_id, tipo, periodo, perfil, resultado, modelo) values
    (h1, null, 'hogar',    '2026-10', '{}',                                 '{"resumen":"hogar 1"}',     'test'),
    (h1, a,    'personal', '2026-10', '{"tu":{"ingreso_mes":1450000}}',     '{"resumen":"personal A"}',  'test'),
    (h1, b,    'personal', '2026-10', '{"tu":{"ingreso_mes":2000000}}',     '{"resumen":"personal B"}',  'test'),
    (h2, null, 'hogar',    '2026-10', '{}',                                 '{"resumen":"hogar 2"}',     'test'),
    (h2, c,    'personal', '2026-10', '{}',                                 '{"resumen":"personal C"}',  'test');
  set local role authenticated;

  -- Cada persona ve el análisis de su hogar y el suyo personal, nada más
  perform public.como(a);
  assert (select count(*) from public.ai_insights) = 2, 'A ve exactamente 2 análisis (hogar + el suyo)';
  assert (select count(*) from public.ai_insights where tipo = 'hogar' and household_id = h1) = 1, 'A ve el análisis del hogar';
  assert (select count(*) from public.ai_insights where user_id = b) = 0, 'A NO ve el análisis personal de B';
  assert (select count(*) from public.ai_insights where perfil::text like '%2000000%') = 0, 'A no puede ver el sueldo de B';
  assert (select count(*) from public.ai_insights where household_id = h2) = 0, 'A no ve otros hogares';

  perform public.como(b);
  assert (select count(*) from public.ai_insights) = 2, 'B ve exactamente 2 análisis';
  assert (select count(*) from public.ai_insights where user_id = a) = 0, 'B NO ve el análisis personal de A';
  assert (select count(*) from public.ai_insights where perfil::text like '%1450000%') = 0, 'B no puede ver el sueldo de A';

  perform public.como(c);
  assert (select count(*) from public.ai_insights) = 2, 'C ve solo lo de su hogar';
  assert (select count(*) from public.ai_insights where household_id = h1) = 0, 'C no ve nada del hogar 1';

  -- Desde la app nadie puede escribir ni borrar (solo el script con service_role)
  perform public.como(a);
  begin
    insert into public.ai_insights (household_id, user_id, tipo, periodo, perfil, resultado, modelo)
    values (h1, a, 'personal', '2026-09', '{}', '{}', 'x');
    raise exception 'A pudo insertar un análisis';
  exception when insufficient_privilege then null; end;
  begin
    update public.ai_insights set resultado = '{"resumen":"hackeado"}';
    raise exception 'A pudo modificar un análisis';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.ai_insights;
    raise exception 'A pudo borrar un análisis';
  exception when insufficient_privilege then null; end;

  -- Sin sesión (anon) no se lee nada
  reset role;
  set local role anon;
  begin
    perform count(*) from public.ai_insights;
    raise exception 'anon pudo leer ai_insights';
  exception when insufficient_privilege then null; end;
  set local role authenticated;

  -- Quien sale del hogar deja de ver sus análisis (traen datos del hogar y de sus ingresos)
  perform public.como(b);
  perform public.leave_household();
  assert (select count(*) from public.ai_insights) = 0, 'B, ya fuera del hogar, no ve ningún análisis';

  -- A, que se queda, sigue viendo lo suyo
  perform public.como(a);
  assert (select count(*) from public.ai_insights) = 2, 'A sigue viendo sus 2 análisis';

  raise notice 'TODAS LAS PRUEBAS DE AI_INSIGHTS PASARON';
end $$;

rollback;
