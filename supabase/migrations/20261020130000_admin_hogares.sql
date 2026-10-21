-- ---------------------------------------------------------------------------------------------
-- Limpieza de hogares sin uso (solo la cuenta administradora).
-- Un hogar se puede borrar si tiene 0 o 1 persona activa y, con 1 persona, lleva 7 días o más sin
-- movimiento. Los hogares de pareja y el hogar del propio administrador nunca se borran.
-- Al borrar un hogar se van con él, en cascada, sus gastos, metas, deudas, sueldos, etc. Las
-- cuentas de acceso (correo/contraseña) NO se borran: la persona vuelve a la pantalla de inicio.
-- ---------------------------------------------------------------------------------------------

create or replace function public.admin_households()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_ok boolean;
  v_mine uuid;
  v_result jsonb;
begin
  select exists (
    select 1 from auth.users u
    where u.id = v_me and lower(u.email) = 'joseromeroesteban353@gmail.com' and u.email_confirmed_at is not null
  ) into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select household_id into v_mine from public.members where user_id = v_me and left_at is null;

  select coalesce(jsonb_agg(t order by t.last_activity), '[]'::jsonb) into v_result
  from (
    select
      h.id,
      left(h.id::text, 8) as code,
      h.created_at,
      m.active_members,
      greatest(h.created_at, coalesce(a.last_at, h.created_at)) as last_activity,
      coalesce(a.expenses, 0) as expenses,
      (m.active_members = 0
        or greatest(h.created_at, coalesce(a.last_at, h.created_at)) < now() - interval '7 days') as deletable
    from public.households h
    cross join lateral (
      select count(*) filter (where left_at is null) as active_members
      from public.members where household_id = h.id
    ) m
    cross join lateral (
      select count(*) as expenses, max(created_at) as last_at from public.expenses where household_id = h.id
    ) a
    where m.active_members <= 1
      and h.id is distinct from v_mine
    limit 200
  ) t;
  return v_result;
end;
$$;

create or replace function public.admin_delete_households(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_ok boolean;
  v_mine uuid;
  v_deleted int;
begin
  select exists (
    select 1 from auth.users u
    where u.id = v_me and lower(u.email) = 'joseromeroesteban353@gmail.com' and u.email_confirmed_at is not null
  ) into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('deleted', 0, 'skipped', 0);
  end if;
  if array_length(p_ids, 1) > 200 then
    raise exception 'Máximo 200 hogares por vez';
  end if;
  select household_id into v_mine from public.members where user_id = v_me and left_at is null;

  -- Se revalida aquí: aunque la lista en pantalla esté desactualizada, nunca se borra un hogar en uso
  with doomed as (
    select h.id
    from public.households h
    where h.id = any (p_ids)
      and h.id is distinct from v_mine
      and (select count(*) from public.members m where m.household_id = h.id and m.left_at is null) <= 1
      and (
        not exists (select 1 from public.members m where m.household_id = h.id and m.left_at is null)
        or greatest(h.created_at, coalesce((select max(e.created_at) from public.expenses e where e.household_id = h.id), h.created_at))
           < now() - interval '7 days'
      )
  ), gone as (
    delete from public.households where id in (select id from doomed) returning 1
  )
  select count(*) into v_deleted from gone;

  return jsonb_build_object('deleted', v_deleted, 'skipped', array_length(p_ids, 1) - v_deleted);
end;
$$;

revoke all on function public.admin_households() from public, anon;
revoke all on function public.admin_delete_households(uuid[]) from public, anon;
grant execute on function public.admin_households() to authenticated;
grant execute on function public.admin_delete_households(uuid[]) to authenticated;
