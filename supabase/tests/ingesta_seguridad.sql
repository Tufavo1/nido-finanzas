-- Copyright (c) 2026 Dinovance
-- Prueba del rol sec_ingest (solo staging). Ejecutar como supabase_admin (postgres no puede SET ROLE a sec_ingest): psql -U supabase_admin -v ON_ERROR_STOP=1 < este archivo
begin;
set local role sec_ingest;
select public.ingest_security_event('login_failed', 'medium', 'ip_test0001', '{"path_kind":"token","status":400,"ip":"203.0.113.0","req_id":"prueba-1","count":1}');
do $$ begin
  begin perform count(*) from public.security_events; raise exception 'FALLO: pudo leer';
  exception when insufficient_privilege then raise notice 'OK: no puede leer security_events'; end;
  begin delete from public.security_events; raise exception 'FALLO: pudo borrar';
  exception when insufficient_privilege then raise notice 'OK: no puede borrar'; end;
  begin update public.security_events set severity = 'info'; raise exception 'FALLO: pudo actualizar';
  exception when insufficient_privilege then raise notice 'OK: no puede actualizar'; end;
  begin perform public.ingest_security_event('role_change', 'high', null, '{}'); raise exception 'FALLO: tipo ajeno';
  exception when invalid_parameter_value then raise notice 'OK: rechaza tipos ajenos'; end;
  begin perform public.ingest_security_event('login_failed', 'low', null, '{"email":"a@b.cl"}'); raise exception 'FALLO: acepto correo';
  exception when invalid_parameter_value then raise notice 'OK: rechaza claves no permitidas (correo)'; end;
  begin perform count(*) from auth.users; raise exception 'FALLO: leyo auth.users';
  exception when insufficient_privilege then raise notice 'OK: no puede leer auth.users'; end;
end $$;
rollback;
