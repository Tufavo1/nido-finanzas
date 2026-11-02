-- Panel de administración: tabla admins, segundo factor (aal2), admin_status, referencias opacas y auditoría.
-- Ejecutar: docker exec -i supabase_db_nido psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/admin.sql
begin;

insert into auth.users (id, aud, role, email, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin@test.cl', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'normal@test.cl', now()),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'sinconfirmar@test.cl', null),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'otro@test.cl', now());

insert into public.admins (user_id)
values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000c3')
on conflict do nothing;

create function public.t_debe_fallar(q text) returns void
language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    return;
  end;
  raise exception 'DEBIA FALLAR: %', q;
end $$;
grant execute on function public.t_debe_fallar(text) to anon, authenticated;

-- Sesión de u con el nivel de autenticación indicado (null = el token no trae la clave aal)
create function public.t_como(u uuid, aal text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    (jsonb_build_object('sub', u) || case when aal is null then '{}'::jsonb else jsonb_build_object('aal', aal) end)::text, true)
$$;
grant execute on function public.t_como(uuid, text) to anon, authenticated;

create function public.t_status() returns text
language sql as $$ select public.admin_status() $$;
grant execute on function public.t_status() to anon, authenticated;

-- Un hogar con dos personas y otro con una, para comprobar lo que devuelve admin_households
insert into public.households (id, name)
values ('00000000-0000-0000-0000-00000000f001', 'Hogar de prueba 1'),
       ('00000000-0000-0000-0000-00000000f002', 'Hogar de prueba 2');
insert into public.members (household_id, user_id, display_name)
values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000b2', 'Nombre Secreto'),
       ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000d4', 'Otro Nombre');

do $$
declare
  adm uuid := '00000000-0000-0000-0000-0000000000a1';
  normal uuid := '00000000-0000-0000-0000-0000000000b2';
  sinconf uuid := '00000000-0000-0000-0000-0000000000c3';
  otro uuid := '00000000-0000-0000-0000-0000000000d4';
  h1 uuid := '00000000-0000-0000-0000-00000000f001';
  h2 uuid := '00000000-0000-0000-0000-00000000f002';
  llamadas text[] := array[
    'select public.admin_stats()',
    'select public.admin_storage()',
    'select public.admin_households()',
    'select public.admin_delete_households(''{}''::uuid[])',
    'select public.admin_remove_member(''00000000-0000-0000-0000-00000000f001''::uuid, ''x'')'
  ];
  q text;
  r jsonb;
  ref text;
  n int;
begin
  set local role authenticated;

  -- 1) Persona normal, incluso con aal2: rechazada
  perform public.t_como(normal, 'aal2');
  assert public.t_status() = 'none', 'usuario normal: status none';
  foreach q in array llamadas loop
    perform public.t_debe_fallar(q);
  end loop;

  -- 2) Admin sin segundo factor (aal1 o sin clave aal): rechazado, pero el status le avisa
  perform public.t_como(adm, 'aal1');
  assert public.t_status() = 'needs_mfa', 'admin aal1: status needs_mfa';
  foreach q in array llamadas loop
    perform public.t_debe_fallar(q);
  end loop;
  perform public.t_como(adm, null);
  assert public.t_status() = 'needs_mfa', 'admin sin clave aal: status needs_mfa';
  foreach q in array llamadas loop
    perform public.t_debe_fallar(q);
  end loop;

  -- 3) Admin con aal2: permitido
  perform public.t_como(adm, 'aal2');
  assert public.t_status() = 'ok', 'admin aal2: status ok';
  perform public.admin_stats();
  perform public.admin_storage();
  perform public.admin_delete_households('{}'::uuid[]);
  assert public.admin_remove_member(h1, 'no-existe') = '{"removed": false, "household_deleted": false}'::jsonb,
    'una referencia falsa no saca a nadie';

  -- 4) Admin con el correo sin confirmar: rechazado aunque tenga aal2
  perform public.t_como(sinconf, 'aal2');
  assert public.t_status() = 'none', 'admin sin correo confirmado: status none';
  foreach q in array llamadas loop
    perform public.t_debe_fallar(q);
  end loop;

  -- 5) Sin sesión (anon): rechazado en todo, y admin_status ni siquiera es invocable
  reset role;
  set local role anon;
  perform public.t_como(adm, 'aal2');
  foreach q in array llamadas loop
    perform public.t_debe_fallar(q);
  end loop;
  perform public.t_debe_fallar('select public.admin_status()');
  perform public.t_debe_fallar('select public.is_admin()');

  -- 6) is_admin es interna, y las tablas del panel no se leen ni escriben desde la API
  reset role;
  set local role authenticated;
  perform public.t_como(adm, 'aal2');
  perform public.t_debe_fallar('select public.is_admin()');
  perform public.t_debe_fallar('select * from public.admins');
  perform public.t_debe_fallar('select * from public.admin_audit');
  perform public.t_debe_fallar('insert into public.admins (user_id) values (''00000000-0000-0000-0000-0000000000b2'')');
  perform public.t_debe_fallar('delete from public.admin_audit');

  -- 7) admin_households: trae nombre del hogar y de cada persona, pero ni user_id ni correo; cada persona lleva una referencia opaca de al menos 16 hex
  r := public.admin_households();
  assert (select count(*) from jsonb_array_elements(r) h where (h ->> 'id')::uuid in (h1, h2)) = 2, 'admin_households lista los hogares ajenos';
  assert exists (select 1 from jsonb_array_elements(r) h where (h ->> 'id')::uuid = h1 and h ->> 'name' = 'Hogar de prueba 1'), 'trae el nombre del hogar';
  assert exists (
    select 1 from jsonb_array_elements(r) h, jsonb_array_elements(h -> 'members') m
    where (h ->> 'id')::uuid = h1 and m ->> 'name' = 'Nombre Secreto'
  ), 'trae el nombre de la persona';
  assert r::text not like '%' || normal::text || '%' and r::text not like '%' || otro::text || '%', 'no se filtran user_id';
  assert r::text not like '%@%', 'no se filtran correos';
  assert not exists (
    select 1 from jsonb_array_elements(r) h, jsonb_array_elements(h -> 'members') m
    where m ? 'user_id' or m ? 'email' or m ->> 'ref' !~ '^[0-9a-f]{16,}$'
  ), 'cada persona trae solo ref (hex, 16+), nombre y joined_at';
  assert not exists (
    select 1 from jsonb_array_elements(r) h where h ? 'amount' or h ? 'salary' or h ? 'email'
  ), 'la lista no trae montos ni sueldos';
  -- Consultar nombres queda en la auditoría (se revisa más abajo); una segunda consulta dentro de 10 minutos no suma otro registro
  perform public.admin_households();

  -- 8) Sacar a una persona con su referencia queda en la auditoría (sin ids de cuenta)
  select m ->> 'ref' into ref
  from jsonb_array_elements(r) h, jsonb_array_elements(h -> 'members') m
  where (h ->> 'id')::uuid = h1;
  assert ref is not null, 'hay referencia para la persona del hogar 1';
  r := public.admin_remove_member(h1, ref);
  assert (r ->> 'removed')::boolean and (r ->> 'household_deleted')::boolean, 'era la única persona: se borra el hogar';

  -- 9) Tope de 20 hogares por llamada y registro de lo borrado
  perform public.t_debe_fallar('select public.admin_delete_households(array_fill(gen_random_uuid(), array[21]))');
  r := public.admin_delete_households(array[h2]);
  assert (r ->> 'deleted')::int = 1, 'se borró el hogar 2';

  reset role;
  select count(*) into n from public.admin_audit where admin_id = adm;
  assert n = 3, 'quedaron 3 registros de auditoría (ver nombres, sacar persona y borrar hogares)';
  assert (select count(*) from public.admin_audit where admin_id = adm and action = 'view_households') = 1, 'la consulta de nombres queda auditada una sola vez';
  assert not exists (select 1 from public.admin_audit where detail::text like '%' || normal::text || '%'), 'la auditoría no guarda ids de cuenta';

  raise notice 'TODAS LAS PRUEBAS DE ADMIN PASARON';
end $$;

rollback;
