-- Se elimina la función de widgets (enlaces de solo lectura para ver el resumen fuera de la app).
-- Nadie la usaba y su función pública `widget_summary` entregaba totales sin respetar la privacidad con la pareja.
-- Primero se reescriben las funciones que tocaban la tabla; después se borra todo lo del widget.

create or replace function public.leave_household()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_h   uuid := public.my_household();
begin
  if v_h is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  perform 1 from public.households where id = v_h for update;

  -- A solas: se borra el hogar completo
  if (select count(*) from public.members where household_id = v_h and left_at is null) = 1 then
    delete from public.households where id = v_h;
    return;
  end if;

  -- En pareja: lo privado y lo personal se va contigo; lo compartido queda en el historial
  delete from public.salaries where user_id = v_uid;
  delete from public.incomes where user_id = v_uid;
  delete from public.profiles where user_id = v_uid;
  delete from public.debts where household_id = v_h and owner_id = v_uid;
  delete from public.recurring_expenses where household_id = v_h and paid_by = v_uid;
  update public.members set left_at = now() where household_id = v_h and user_id = v_uid;
end;
$$;

create or replace function public.admin_remove_member(p_household uuid, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform 1 from public.households where id = p_household for update;
  select m.user_id into v_user
  from public.members m
  where m.household_id = p_household and m.left_at is null
    and left(encode(sha256(convert_to(m.user_id::text || ':' || m.household_id::text, 'UTF8')), 'hex'), 20) = p_ref;
  if v_user is null then
    return jsonb_build_object('removed', false, 'household_deleted', false);
  end if;
  if v_user = v_me then
    raise exception 'No puedes sacarte a ti mismo desde el panel';
  end if;

  insert into public.admin_audit (admin_id, action, detail)
  values (v_me, 'remove_member', jsonb_build_object('household_id', p_household));

  if (select count(*) from public.members where household_id = p_household and left_at is null) = 1 then
    delete from public.households where id = p_household;
    return jsonb_build_object('removed', true, 'household_deleted', true);
  end if;

  delete from public.salaries where user_id = v_user;
  delete from public.incomes where user_id = v_user;
  delete from public.profiles where user_id = v_user;
  delete from public.debts where household_id = p_household and owner_id = v_user;
  delete from public.recurring_expenses where household_id = p_household and paid_by = v_user;
  update public.members set left_at = now() where household_id = p_household and user_id = v_user;
  return jsonb_build_object('removed', true, 'household_deleted', false);
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'db_bytes', pg_database_size(current_database()),
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
      'new_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      'new_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      'active_1d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '1 day'),
      'active_7d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
      'active_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days')
    ),
    'households', jsonb_build_object(
      'total', (select count(*) from public.households),
      'couples', (select count(*) from (select household_id from public.members group by household_id having count(*) >= 2) t),
      'solo', (select count(*) from (select household_id from public.members group by household_id having count(*) = 1) t)
    ),
    'usage', jsonb_build_object(
      'expenses_total', (select count(*) from public.expenses),
      'expenses_7d', (select count(*) from public.expenses where created_at >= now() - interval '7 days'),
      'expenses_30d', (select count(*) from public.expenses where created_at >= now() - interval '30 days'),
      'users_with_expense_7d', (select count(distinct created_by) from public.expenses where created_at >= now() - interval '7 days')
    ),
    -- Cuántos hogares/personas usan cada función (qué se usa más)
    'features', jsonb_build_array(
      jsonb_build_object('name', 'Gastos', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.expenses)),
      jsonb_build_object('name', 'Metas', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.goals)),
      jsonb_build_object('name', 'Aportes a metas', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.contributions)),
      jsonb_build_object('name', 'Gastos fijos', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.recurring_expenses)),
      jsonb_build_object('name', 'Deudas', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.debts)),
      jsonb_build_object('name', 'Pagos de deudas', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.debt_payments)),
      jsonb_build_object('name', 'Plata extra', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.incomes)),
      jsonb_build_object('name', 'Sueldo guardado', 'unit', 'personas', 'count', (select count(*) from public.salaries)),
      jsonb_build_object('name', 'Avisos al celular', 'unit', 'personas', 'count', (select count(distinct user_id) from public.push_subscriptions))
    ),
    -- Últimos 14 días, un número por día (incluye días en cero)
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d::date,
        'signups', (select count(*) from auth.users u where (u.created_at at time zone 'America/Santiago')::date = d::date),
        'expenses', (select count(*) from public.expenses e where (e.created_at at time zone 'America/Santiago')::date = d::date)
      ) order by d), '[]'::jsonb)
      from generate_series(
        ((now() at time zone 'America/Santiago')::date - 13)::timestamp,
        (now() at time zone 'America/Santiago')::date::timestamp,
        interval '1 day'
      ) d
    )
  ) into v_result;

  return v_result;
end;
$$;

drop function if exists public.widget_summary(text);
drop function if exists public.create_widget_token(text);
drop table if exists public.widget_tokens;
