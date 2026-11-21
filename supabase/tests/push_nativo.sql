-- Copyright (c) 2026 Dinovance
-- Tokens de push nativos: RLS por persona, validación del token y tope por persona.
-- Ejecutar (SOLO staging local): docker exec -i nido-selfhost-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/push_nativo.sql
begin;

insert into auth.users (id, aud, role, email, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a-push@test.cl', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b-push@test.cl', now());

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

create function public.t_como(u uuid) returns void
language sql as $$ select set_config('request.jwt.claims', jsonb_build_object('sub', u)::text, true) $$;
grant execute on function public.t_como(uuid) to anon, authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  n int;
begin
  set local role authenticated;
  perform public.t_como(a);
  insert into public.native_push_tokens (token, platform) values ('token-de-a-0123456789abcdef', 'android');
  perform public.t_debe_fallar('insert into public.native_push_tokens (token, platform) values (''corto'', ''android'')');
  perform public.t_debe_fallar('insert into public.native_push_tokens (token, platform) values (''token con espacios y simbolos <script>'', ''android'')');
  perform public.t_debe_fallar('insert into public.native_push_tokens (token, platform) values (''token-de-a-otro-0123456789'', ''windows'')');
  perform public.t_debe_fallar('insert into public.native_push_tokens (user_id, token, platform) values (''00000000-0000-0000-0000-0000000000b2'', ''token-ajeno-0123456789abcd'', ''android'')');
  perform public.t_debe_fallar('update public.native_push_tokens set token = ''otro-token-0123456789abcdef''');

  perform public.t_como(b);
  select count(*) into n from public.native_push_tokens;
  assert n = 0, 'b no ve los tokens de a';
  delete from public.native_push_tokens;
  perform public.t_como(a);
  select count(*) into n from public.native_push_tokens;
  assert n = 1, 'b no pudo borrar el token de a';

  for i in 1..9 loop
    insert into public.native_push_tokens (token, platform) values ('token-extra-' || lpad(i::text, 12, '0'), 'android');
  end loop;
  perform public.t_debe_fallar('insert into public.native_push_tokens (token, platform) values (''token-numero-once-0123456'', ''android'')');

  reset role;
  set local role anon;
  perform public.t_debe_fallar('select * from public.native_push_tokens');
  perform public.t_debe_fallar('insert into public.native_push_tokens (user_id, token, platform) values (''00000000-0000-0000-0000-0000000000a1'', ''token-anon-0123456789abcdef'', ''android'')');

  raise notice 'TODAS LAS PRUEBAS DE PUSH NATIVO PASARON';
end $$;

rollback;
