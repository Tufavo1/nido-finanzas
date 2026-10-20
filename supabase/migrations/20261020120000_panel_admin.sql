-- Panel de administración: estadísticas agregadas de uso.
-- Solo números (conteos); nunca montos, nombres, correos ni datos de una persona.
-- Una sola función, solo para la cuenta administradora (correo confirmado) y de solo lectura.

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
  v_result jsonb;
begin
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'joseromeroesteban353@gmail.com'
      and u.email_confirmed_at is not null
  ) into v_ok;
  if not coalesce(v_ok, false) then
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
      jsonb_build_object('name', 'Avisos al celular', 'unit', 'personas', 'count', (select count(distinct user_id) from public.push_subscriptions)),
      jsonb_build_object('name', 'Widgets', 'unit', 'hogares', 'count', (select count(distinct household_id) from public.widget_tokens))
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

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
