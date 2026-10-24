-- ---------------------------------------------------------------------------------------------
-- El administrador ve TODOS los hogares (también parejas y los usados hace poco), puede borrarlos
-- y puede sacar a una persona de su hogar. Solo se protege el hogar del propio administrador.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.admin_households();

create function public.admin_households()
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
      true as deletable,
      m.members
    from public.households h
    cross join lateral (
      select
        count(*) filter (where left_at is null) as active_members,
        coalesce(jsonb_agg(jsonb_build_object(
          'user_id', mm.user_id, 'name', mm.display_name, 'joined_at', mm.joined_at
        ) order by mm.joined_at) filter (where mm.left_at is null), '[]'::jsonb) as members
      from public.members mm where mm.household_id = h.id
    ) m
    cross join lateral (
      select count(*) as expenses, max(created_at) as last_at from public.expenses where household_id = h.id
    ) a
    where h.id is distinct from v_mine
    order by greatest(h.created_at, coalesce(a.last_at, h.created_at))
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

  with gone as (
    delete from public.households
    where id = any (p_ids) and id is distinct from v_mine
    returning 1
  )
  select count(*) into v_deleted from gone;

  return jsonb_build_object('deleted', v_deleted, 'skipped', array_length(p_ids, 1) - v_deleted);
end;
$$;

-- Saca a una persona de su hogar (mismo efecto que "salir del hogar"). Si era la única, se borra el hogar.
create function public.admin_remove_member(p_household uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_ok boolean;
begin
  select exists (
    select 1 from auth.users u
    where u.id = v_me and lower(u.email) = 'joseromeroesteban353@gmail.com' and u.email_confirmed_at is not null
  ) into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_user = v_me then
    raise exception 'No puedes sacarte a ti mismo desde el panel';
  end if;
  perform 1 from public.households where id = p_household for update;
  if not exists (
    select 1 from public.members where household_id = p_household and user_id = p_user and left_at is null
  ) then
    return jsonb_build_object('removed', false, 'household_deleted', false);
  end if;

  if (select count(*) from public.members where household_id = p_household and left_at is null) = 1 then
    delete from public.households where id = p_household;
    return jsonb_build_object('removed', true, 'household_deleted', true);
  end if;

  delete from public.salaries where user_id = p_user;
  delete from public.incomes where user_id = p_user;
  delete from public.profiles where user_id = p_user;
  delete from public.debts where household_id = p_household and owner_id = p_user;
  delete from public.widget_tokens where household_id = p_household and created_by = p_user;
  delete from public.recurring_expenses where household_id = p_household and paid_by = p_user;
  update public.members set left_at = now() where household_id = p_household and user_id = p_user;
  return jsonb_build_object('removed', true, 'household_deleted', false);
end;
$$;

revoke all on function public.admin_households() from public, anon;
revoke all on function public.admin_delete_households(uuid[]) from public, anon;
revoke all on function public.admin_remove_member(uuid, uuid) from public, anon;
grant execute on function public.admin_households() to authenticated;
grant execute on function public.admin_delete_households(uuid[]) to authenticated;
grant execute on function public.admin_remove_member(uuid, uuid) to authenticated;
