-- Al borrar la cuenta, el nombre de la persona ya no queda en el historial del hogar.
--
-- Antes: delete_account() dejaba la fila de members con el display_name original, aunque la cuenta
-- (correo, sesiones, sueldo, ingresos, perfil) se hubiera borrado.
-- Ahora: esa fila se conserva (los gastos, aportes y pagos del hogar siguen apuntando a ella y la
-- contabilidad compartida no se rompe), pero con un nombre genérico. salir del hogar (leave_household)
-- no cambia: la persona puede volver y recuperar su historial.
--
-- user_id no se toca: es parte de la clave de members y de las claves foráneas de los gastos. Queda
-- como un identificador sin cuenta asociada.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if public.my_household() is not null then
    perform public.leave_household();
  end if;
  delete from public.push_subscriptions where user_id = v_uid;
  -- Lo que se queda en hogares de pareja: sin el nombre de la persona
  update public.members set display_name = 'Persona que salió' where user_id = v_uid;
  -- Arrastra sesiones, identidades, sueldo, ingresos y perfil (on delete cascade)
  delete from auth.users where id = v_uid;
end;
$$;
